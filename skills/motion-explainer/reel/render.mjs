// Renders index.html (driven by scenes.json) to a frame-exact MP4: seek(t) per frame -> PNG -> ffmpeg.
// Usage: node render.mjs                  MP4 + SRT for each size in scenes.json "sizes" (else "size", else 9:16)
//        node render.mjs --size 16:9      one size only (9:16, 16:9, 1:1)
//        node render.mjs --at 6,20,35     stills only, for checking
//        node render.mjs --cover          cover PNG from cover.html
//        node render.mjs --serve          live presenter mode: open the printed URL and screen-record
//        node render.mjs --script         SCRIPT.md (voice-over table) from each scene's "say"; no browser
//        node render.mjs --check          validate scenes.json only
//        --fps 30
// Outputs land next to this file: reel.mp4 / reel.srt / cover.png / still-<t>.png, or with a -9x16 style suffix
// when several sizes are rendered. Chrome: $CHROME, else installed Google Chrome, else chromium on PATH.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { delimiter, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { LAYOUTS, pickSize, scriptMarkdown, srt, timeline, validate } from "./core.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const FPS = Number(opt("--fps", 30));
const AT = opt("--at", null), SIZE = opt("--size", null);
const SERVE = args.includes("--serve"), COVER = args.includes("--cover"), SCRIPT = args.includes("--script"), CHECK = args.includes("--check");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const R = JSON.parse(await readFile(join(HERE, "scenes.json"), "utf8"));
const problems = validate(R);
if (problems.length) {
  console.error(`scenes.json:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (CHECK) { console.log("scenes.json ok"); process.exit(0); }
if (SCRIPT) {
  await writeFile(join(HERE, "SCRIPT.md"), scriptMarkdown(R));
  console.log(`wrote ${join(HERE, "SCRIPT.md")}`);
  process.exit(0);
}
const sizes = (SIZE ? [SIZE] : R.sizes ?? [R.size ?? "9:16"]).map(s => pickSize(R, s));
const name = (base, ext, size) => join(HERE, `${base}${sizes.length > 1 ? `-${size.replace(":", "x")}` : ""}${ext}`);

// static server over `root` (scenes.json, default ".." = the folder holding the SVGs) so the page and the diagram
// iframes share one origin: seek() reaches into the iframes, and relative paths in scenes.json just work
const ROOT = resolve(HERE, R.root ?? "..");
const PAGE = "/" + relative(ROOT, HERE).split(sep).filter(Boolean).map(encodeURIComponent).join("/");
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const body = await readFile(join(ROOT, path)).catch(() => null);
  if (!body) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
}).listen(SERVE ? 8765 : 0, "127.0.0.1");
await new Promise(ok => server.once("listening", ok));
const url = (page, size, render) => `http://127.0.0.1:${server.address().port}${PAGE}/${page}?size=${size}${render ? "&render" : ""}`;
if (SERVE) {
  for (const s of sizes) console.log(`live reel ${s}: ${url("index.html", s)}`);
  console.log("←/→ scenes, space pause, ctrl+c to stop");
  await new Promise(() => {});
}

async function launch() {
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME });
  try { return await chromium.launch({ channel: "chrome" }); } catch (err) {
    for (const dir of (process.env.PATH ?? "").split(delimiter))
      for (const exe of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"])
        if (existsSync(join(dir, exe))) return chromium.launch({ executablePath: join(dir, exe) });
    throw new Error(`no Chrome found (${err.message.split("\n")[0]}); install Google Chrome or set CHROME=/path/to/chrome`);
  }
}

const browser = await launch();
for (const size of sizes) {
  const { W, H } = LAYOUTS[size];
  const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: "dark" });
  page.on("pageerror", e => { console.error(e); process.exit(1); });
  if (COVER) {
    await page.goto(url("cover.html", size));
    await page.evaluate(() => window.ready);
    const out = name("cover", ".png", size);
    await page.locator("#stage").screenshot({ path: out });
    console.log(`wrote ${out}`);
    continue;
  }
  await page.goto(url("index.html", size, true));
  if (!await page.evaluate(async () => { await window.ready; return typeof window.seek === "function"; }))
    throw new Error("index.html did not start (check the browser console: a module failed to load?)");
  const stage = page.locator("#stage");
  // after a seek, wait two frames so the diagram iframes repaint (otherwise a jump can capture the previous frame)
  const shot = async t => {
    await page.evaluate(t => { seek(t); return new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); }, t);
    return stage.screenshot({ type: "png", animations: "allow" });
  };

  if (AT) {
    for (const t of AT.split(",").map(Number)) {
      const out = name(`still-${t}`, ".png", size);
      await writeFile(out, await shot(t));
      console.log(`wrote ${out}`);
    }
    continue;
  }
  const { scenes, total } = timeline(R), out = name("reel", ".mp4", size);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = Math.round(total * FPS);
  for (let i = 0; i < n; i++) {
    if (!ff.stdin.write(await shot(i / FPS))) await new Promise(ok => ff.stdin.once("drain", ok));
    if (i % FPS === 0) process.stdout.write(`\r${size} ${(i / FPS).toFixed(0)}/${total}s`);
  }
  ff.stdin.end();
  await new Promise((ok, fail) => ff.on("close", c => (c ? fail(new Error(`ffmpeg exit ${c}`)) : ok())));
  await writeFile(out.replace(/\.mp4$/, ".srt"), srt(scenes));
  console.log(`\nwrote ${out}`);
  await page.close();
}
await browser.close();
server.close();

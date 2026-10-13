// Built-in renderer: index.html (Web Animations + the diagrams' own CSS) in headless Chrome, frame by frame → ffmpeg.
// Renderer contract (shared with renderers/remotion.mjs):
//   video({ R, dir, size, out, fps, progress })  silent MP4 of the timeline in R (scenes already fitted to any voice)
//   stills({ R, dir, size, times, outFor })      PNG per time; outFor(t) → path
//   cover({ R, dir, size, out })                 cover PNG
//   serve?({ R, dir, sizes, port })              optional: live pages until ctrl+c
//   close()                                      release browser / server
// R is served as the page's scenes.json from memory, so fitted durations reach the page without touching the file.
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { delimiter, extname, join, normalize, relative, resolve, sep } from "node:path";
import { chromium } from "playwright-core";
import { LAYOUTS, timeline } from "../core.mjs";

const TYPES = { ".html": "text/html", ".css": "text/css", ".mjs": "text/javascript", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4" };
let server, browser, current;

// static server over `root` (scenes.json, default ".." = the folder holding the SVGs) so the page and the diagram
// iframes share one origin: seek() reaches into the iframes, and relative paths in scenes.json just work
async function serveFiles(R, dir, port = 0) {
  current = R;
  if (server) return server;
  const ROOT = resolve(dir, R.root ?? "..");
  const PAGE = "/" + relative(ROOT, dir).split(sep).filter(Boolean).map(encodeURIComponent).join("/");
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    const body = path === join(PAGE, "scenes.json") ? JSON.stringify(current) : await readFile(join(ROOT, path)).catch(() => null);
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  }).listen(port, "127.0.0.1");
  await new Promise(ok => server.once("listening", ok));
  server.url = (page, size, render) => `http://127.0.0.1:${server.address().port}${PAGE}/${page}?size=${size}${render ? "&render" : ""}`;
  return server;
}

async function launch() {
  if (browser) return browser;
  if (process.env.CHROME) return (browser = await chromium.launch({ executablePath: process.env.CHROME }));
  try { return (browser = await chromium.launch({ channel: "chrome" })); } catch (err) {
    for (const d of (process.env.PATH ?? "").split(delimiter))
      for (const exe of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"])
        if (existsSync(join(d, exe))) return (browser = await chromium.launch({ executablePath: join(d, exe) }));
    throw new Error(`no Chrome found (${err.message.split("\n")[0]}); install Google Chrome or set CHROME=/path/to/chrome`);
  }
}

async function open(R, dir, size, file, render) {
  const srv = await serveFiles(R, dir), b = await launch(), { W, H } = LAYOUTS[size];
  const page = await b.newPage({ viewport: { width: W, height: H }, colorScheme: "dark" });
  page.on("pageerror", e => { console.error(e); process.exit(1); });
  await page.goto(srv.url(file, size, render));
  return page;
}

async function reel(R, dir, size) {
  const page = await open(R, dir, size, "index.html", true);
  if (!await page.evaluate(async () => { await window.ready; return typeof window.seek === "function"; }))
    throw new Error("index.html did not start (check the browser console: a module failed to load?)");
  const stage = page.locator("#stage");
  // after a seek, wait two frames so the diagram iframes repaint (otherwise a jump can capture the previous frame)
  const shot = async t => {
    await page.evaluate(t => { seek(t); return new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))); }, t);
    return stage.screenshot({ type: "png", animations: "allow" });
  };
  return { page, shot };
}

export default {
  name: "builtin",
  async video({ R, dir, size, out, fps = 30, progress = () => {} }) {
    const { page, shot } = await reel(R, dir, size), { total } = timeline(R);
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const n = Math.round(total * fps);
    for (let i = 0; i < n; i++) {
      if (!ff.stdin.write(await shot(i / fps))) await new Promise(ok => ff.stdin.once("drain", ok));
      if (i % fps === 0) progress(i / fps, total);
    }
    ff.stdin.end();
    await new Promise((ok, fail) => ff.on("close", c => (c ? fail(new Error(`ffmpeg exit ${c}`)) : ok())));
    await page.close();
    return out;
  },
  async stills({ R, dir, size, times, outFor }) {
    const { page, shot } = await reel(R, dir, size), files = [];
    for (const t of times) {
      await writeFile(outFor(t), await shot(t));
      files.push(outFor(t));
    }
    await page.close();
    return files;
  },
  async cover({ R, dir, size, out }) {
    const page = await open(R, dir, size, "cover.html");
    await page.evaluate(() => window.ready);
    await page.locator("#stage").screenshot({ path: out });
    await page.close();
    return out;
  },
  async serve({ R, dir, sizes, port = 8765, pages = ["index.html"] }) {
    const srv = await serveFiles(R, dir, port);
    for (const p of pages) for (const s of sizes) console.log(`${p} ${s}: ${srv.url(p, s)}`);
    console.log("←/→ scenes, space pause, ctrl+c to stop");
    await new Promise(() => {});
  },
  /** Static copy of the deck: slides page + engine + scenes.json with every referenced file copied under files/. */
  async exportSlides({ R, dir, out }) {
    const { cp, mkdir, writeFile: wf } = await import("node:fs/promises");
    await mkdir(join(out, "files"), { recursive: true });
    for (const f of ["slides.html", "reel.css", "core.mjs", "scene-dom.mjs"]) await cp(join(dir, f), join(out, f));
    const copied = new Map(), local = async p => {
      if (!p) return p;
      if (!copied.has(p)) { const name = `files/${copied.size}-${p.split("/").pop()}`; await cp(resolve(dir, p), join(out, name)); copied.set(p, name); }
      return copied.get(p);
    };
    const scenes = [];
    for (const s of R.scenes) scenes.push({ ...s, diagram: await local(s.diagram), logo: await local(s.logo),
      ...(s.slide && { slide: { ...s.slide, diagram: await local(s.slide.diagram) } }) });
    await wf(join(out, "scenes.json"), JSON.stringify({ ...R, root: ".", scenes, cover: undefined }, null, 1));
    return out;
  },
  async close() {
    await browser?.close();
    server?.close();
    browser = server = undefined;
  },
};

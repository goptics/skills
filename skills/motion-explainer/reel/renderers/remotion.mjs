// Remotion renderer: the reel/remotion/ project (React, frame-driven) behind the same contract as renderers/builtin.mjs:
//   video({ R, dir, size, out, fps, progress })   stills({ R, dir, size, times, outFor })   cover({ R, dir, size, out })
//   serve({ R, dir })  (Remotion Studio)           close()
// Needs `npm install` in reel/remotion. Licence: free for individuals, organisations of up to 3 and non-profits;
// larger companies need a Remotion Company License (https://www.remotion.dev/docs/license).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { timeline } from "../core.mjs";

const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
let bundled, chrome;

async function lib(dir, name) {
  const pkg = join(dir, "remotion", "package.json");
  if (!existsSync(join(dir, "remotion", "node_modules"))) throw new Error(`Remotion is not installed: cd ${join(dir, "remotion")} && npm install`);
  return import(pathToFileURL(createRequire(pkg).resolve(name)).href);
}

/** Everything the composition needs, as plain props: scenes, motion data per diagram, images, the shared CSS. */
async function props(R, dir, size, fps) {
  const diagrams = new Set([...R.scenes.map(s => s.diagram), R.cover?.diagram].filter(Boolean));
  const motions = {};
  for (const d of diagrams) {
    const json = resolve(dir, d.replace(/\.svg$/, ".motion.json"));
    if (!existsSync(json)) {
      const kfu = resolve(dir, "..", "gen", "kfu.py");
      if (!existsSync(kfu)) throw new Error(`${json} missing; make it with: python3 <gen>/kfu.py --motion ${resolve(dir, d)}`);
      execFileSync("python3", [kfu, "--motion", resolve(dir, d)], { stdio: "ignore" });
    }
    motions[d] = JSON.parse(await readFile(json, "utf8"));
  }
  const assets = {};
  for (const img of [...R.scenes.map(s => s.logo), R.cover?.logo].filter(Boolean))
    assets[img] = `data:${MIME[extname(img).toLowerCase()] ?? "application/octet-stream"};base64,${(await readFile(resolve(dir, img))).toString("base64")}`;
  const css = { reel: await readFile(join(dir, "reel.css"), "utf8"), cover: await readFile(join(dir, "cover.css"), "utf8") };
  return { R, size, fps, motions, assets, css };
}

async function setup(dir) {
  const { bundle } = await lib(dir, "@remotion/bundler");
  bundled ??= await bundle({ entryPoint: join(dir, "remotion", "src", "index.jsx") });
  if (chrome === undefined) {   // prefer the system Chrome; else Remotion downloads its own headless shell
    chrome = process.env.CHROME ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync) ?? null;
  }
  return { serveUrl: bundled, browser: chrome ? { browserExecutable: chrome, chromeMode: "chrome-for-testing" } : {} };
}

async function composition(dir, id, inputProps) {
  const { selectComposition } = await lib(dir, "@remotion/renderer");
  const { serveUrl, browser } = await setup(dir);
  return { comp: await selectComposition({ serveUrl, id, inputProps, ...browser }), serveUrl, browser };
}

/** The Player deck (remotion/deck): Vite dev server, or a static build into `out`. */
async function deck(R, dir, size, out) {
  const rdir = join(dir, "remotion"), { mkdir } = await import("node:fs/promises");
  await mkdir(join(rdir, "deck", "public"), { recursive: true });
  await writeFile(join(rdir, "deck", "public", "props.json"), JSON.stringify(await props(R, dir, size, 30)));
  const vite = join(dirname(createRequire(join(rdir, "package.json")).resolve("vite/package.json")), "bin", "vite.js");
  const args = out ? ["build"] : ["--port", "8766", "--strictPort"];
  const p = spawn(process.execPath, [vite, ...args], { cwd: rdir, stdio: "inherit", env: { ...process.env, DECK_OUT: out ? resolve(out) : "" } });
  if (!out) { console.log("Remotion slides: http://localhost:8766/  (ctrl+c to stop)"); return new Promise(() => {}); }
  await new Promise((ok, fail) => p.on("close", c => (c ? fail(new Error(`vite build exit ${c}`)) : ok())));
  return out;
}

export default {
  name: "remotion",
  async video({ R, dir, size, out, fps = 30, progress = () => {} }) {
    const { renderMedia } = await lib(dir, "@remotion/renderer"), inputProps = await props(R, dir, size, fps);
    const { comp, serveUrl, browser } = await composition(dir, "Reel", inputProps);
    const total = timeline(R).total;
    await renderMedia({ composition: comp, serveUrl, inputProps, codec: "h264", outputLocation: out, crf: 18, pixelFormat: "yuv420p",
      x264Preset: "slow", muted: true, ...browser, onProgress: ({ progress: p }) => progress(p * total, total) });
    return out;
  },
  async stills({ R, dir, size, times, outFor, fps = 30 }) {
    const { renderStill } = await lib(dir, "@remotion/renderer"), inputProps = await props(R, dir, size, fps);
    const { comp, serveUrl, browser } = await composition(dir, "Reel", inputProps);
    for (const t of times) await renderStill({ composition: comp, serveUrl, inputProps, frame: Math.min(comp.durationInFrames - 1, Math.round(t * fps)), output: outFor(t), ...browser });
    return times.map(outFor);
  },
  async cover({ R, dir, size, out }) {
    const { renderStill } = await lib(dir, "@remotion/renderer"), inputProps = await props(R, dir, size, 30);
    const { comp, serveUrl, browser } = await composition(dir, "Cover", inputProps);
    await renderStill({ composition: comp, serveUrl, inputProps, output: out, ...browser });
    return out;
  },
  async serve({ R, dir, sizes, pages = [] }) {
    if (pages.includes("slides.html")) return deck(R, dir, sizes[0]);
    const file = join(tmpdir(), `remotion-props-${process.pid}.json`);
    await writeFile(file, JSON.stringify(await props(R, dir, sizes[0], 30)));
    await lib(dir, "@remotion/cli");
    const cli = join(dirname(createRequire(join(dir, "remotion", "package.json")).resolve("@remotion/cli/package.json")), "remotion-cli.js");
    console.log(`Remotion Studio (props: ${file}); ctrl+c to stop`);
    spawn(process.execPath, [cli, "studio", "src/index.jsx", `--props=${file}`], { cwd: join(dir, "remotion"), stdio: "inherit" });
    await new Promise(() => {});
  },
  async exportSlides({ R, dir, size, out }) { return deck(R, dir, size, out); },
  async close() {},
};

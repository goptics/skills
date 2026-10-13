// Renders scenes.json: MP4 + SRT per size, stills, cover, live mode, SCRIPT.md. Thin CLI: data comes from core.mjs,
// frames from a renderer (renderers/<name>.mjs), voice-over from audio.mjs + voice/<provider>.mjs.
// Usage: node render.mjs                  MP4 + SRT for each size in scenes.json "sizes" (else "size", else 9:16)
//        node render.mjs --size 16:9      one size only (9:16, 16:9, 1:1)
//        node render.mjs --at 6,20,35     stills only, for checking (voice-fitted timing when audio is set)
//        node render.mjs --cover          cover PNG from cover.html
//        node render.mjs --serve          live presenter mode: open the printed URL and screen-record
//        node render.mjs --slides         slide deck (slides.html), keyboard driven; see references/slides.md
//        node render.mjs --slides --export <dir>   static copy of the deck to host anywhere
//        node render.mjs --script         SCRIPT.md (voice-over table) from each scene's "say"; no browser
//        node render.mjs --check          validate scenes.json only
//        --fps 30   --renderer builtin|remotion (default: scenes.json "renderer", else builtin)   --no-voice
// Outputs land next to this file: reel.mp4 / reel.srt / cover.png / still-<t>.png, or with a -9x16 style suffix
// when several sizes are rendered. Chrome: $CHROME, else installed Google Chrome, else chromium on PATH.
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickSize, scriptMarkdown, srt, timeline, validate, voiceSrt } from "./core.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const flag = name => args.includes(name);
const FPS = Number(opt("--fps", 30));
const AT = opt("--at", null), SIZE = opt("--size", null), RENDERER = opt("--renderer", null), EXPORT = opt("--export", null);

const HERE = fileURLToPath(new URL(".", import.meta.url));
const R = JSON.parse(await readFile(join(HERE, "scenes.json"), "utf8"));
const problems = validate(R);
if (problems.length) {
  console.error(`scenes.json:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (flag("--check")) { console.log("scenes.json ok"); process.exit(0); }
if (flag("--script")) {
  await writeFile(join(HERE, "SCRIPT.md"), scriptMarkdown(R));
  console.log(`wrote ${join(HERE, "SCRIPT.md")}`);
  process.exit(0);
}

const sizes = (SIZE ? [SIZE] : R.sizes ?? [R.size ?? "9:16"]).map(s => pickSize(R, s));
const name = (base, ext, size) => join(HERE, `${base}${sizes.length > 1 ? `-${size.replace(":", "x")}` : ""}${ext}`);
const rname = RENDERER ?? R.renderer ?? "builtin";
if (!/^[a-z][a-z0-9-]*$/.test(rname)) throw new Error(`renderer "${rname}" is not a renderer name`);
const renderer = (await import(new URL(`./renderers/${rname}.mjs`, import.meta.url))).default;

// voice-over first: its clips decide the scene lengths everything else uses
const voiced = R.audio?.voice && !flag("--no-voice") && !flag("--cover");
const audio = voiced ? await (await import("./audio.mjs")).prepare(R, HERE, { log: m => console.log(m) }) : null;
const T = audio?.R ?? R;

if (flag("--slides") && EXPORT) {
  console.log(`wrote ${await renderer.exportSlides({ R: T, dir: HERE, size: SIZE ?? T.slides?.size ?? "16:9", out: EXPORT })}`);
  await renderer.close();
  process.exit(0);
}
if (flag("--serve") || flag("--slides")) {
  await renderer.serve({ R: T, dir: HERE, sizes: flag("--slides") && !SIZE ? [T.slides?.size ?? "16:9"] : sizes,
    pages: [flag("--slides") ? "slides.html" : "index.html"] });
}
for (const size of sizes) {
  if (flag("--cover")) {
    console.log(`wrote ${await renderer.cover({ R: T, dir: HERE, size, out: name("cover", ".png", size) })}`);
    continue;
  }
  if (AT) {
    const files = await renderer.stills({ R: T, dir: HERE, size, times: AT.split(",").map(Number), outFor: t => name(`still-${t}`, ".png", size) });
    files.forEach(f => console.log(`wrote ${f}`));
    continue;
  }
  const out = name("reel", ".mp4", size), { scenes, total } = timeline(T);
  const silent = audio ? join(tmpdir(), `reel-${process.pid}-${size.replace(":", "x")}.mp4`) : out;
  await renderer.video({ R: T, dir: HERE, size, out: silent, fps: FPS,
    progress: (t, n) => process.stdout.write(`\r${size} ${t.toFixed(0)}/${n.toFixed(0)}s`) });
  if (audio) {
    const { mix, mux } = await import("./audio.mjs");
    const m4a = silent.replace(/\.mp4$/, ".m4a");
    await mix({ scenes, total, clips: audio.clips, track: audio.track, lead: audio.lead, music: R.audio.music, dir: HERE, out: m4a });
    await mux(silent, m4a, out);
    await Promise.all([rm(silent), rm(m4a)]);
  }
  // captions: the spoken words when there is a per-scene voice, else each scene's caption
  const cues = audio ? voiceSrt(scenes, audio.clips, { lead: audio.lead }) : "";
  await writeFile(out.replace(/\.mp4$/, ".srt"), cues || srt(scenes));
  console.log(`\nwrote ${out}`);
}
await renderer.close();

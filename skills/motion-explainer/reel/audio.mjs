// Voice-over pipeline: clips from the chosen provider (cached), scene lengths fitted to them, music under the voice,
// and the final mix muxed into the video. Providers make clips (voice/); this module times, mixes and muxes.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fitToVoice } from "./core.mjs";
import { provider, run, seconds } from "./voice/provider.mjs";

/** Voice clips for every scene with `say` (or a recorded `voice`), plus the scenes refitted to them.
 *  Clips are cached in reel/vo/ by provider + options + text, so re-renders don't re-synthesise. */
export async function prepare(R, dir, { log = () => {} } = {}) {
  const v = R.audio.voice, lead = R.audio.lead ?? .4, tail = R.audio.tail ?? .9;
  const p = await provider(v.provider);
  const problems = await (p.check?.(v, dir) ?? []);
  if (problems.length) throw new Error(`voice provider ${v.provider}:\n  ${problems.join("\n  ")}`);
  const track = await p.track?.(v, dir);
  if (track) return { R, clips: R.scenes.map(() => null), track, lead };
  const cache = join(dir, "vo");
  mkdirSync(cache, { recursive: true });
  const clips = [];
  for (const [index, scene] of R.scenes.entries()) {
    if (!scene.say && !scene.voice) { clips.push(null); continue; }
    const key = createHash("sha1").update(JSON.stringify([v, scene.say ?? "", scene.voice ?? ""])).digest("hex").slice(0, 10);
    const stem = `${String(index + 1).padStart(2, "0")}-${key}`;
    const hit = readdirSync(cache).find(f => f.startsWith(stem + ".") && !f.endsWith(".txt"));
    if (hit) { clips.push({ file: join(cache, hit), seconds: await seconds(join(cache, hit)) }); continue; }
    log(`voice ${v.provider}: scene ${index + 1}`);
    clips.push(await p.synthesize({ scene, index, text: scene.say ?? "", out: join(cache, stem), opts: v, dir }));
  }
  return { R: fitToVoice(R, clips, { lead, tail }), clips, track: null, lead };
}

/** Mix the voice (clips placed at scene start + lead, or one track) and optional music into an AAC file. */
export async function mix({ scenes, total, clips, track, lead, music, dir, out }) {
  const inputs = [], parts = [];
  const voice = track ? [{ file: track.file, at: 0 }] : clips.map((c, i) => c && { file: c.file, at: scenes[i].start + lead }).filter(Boolean);
  voice.forEach((c, i) => {
    inputs.push("-i", c.file);
    parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[v${i}]`);
  });
  parts.push(`${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0:duration=longest,apad,atrim=0:${total}[voice]`);
  let last = "voice";
  if (music) {
    const m = voice.length;
    inputs.push("-stream_loop", "-1", "-i", join(dir, music.file));
    parts.push(`[${m}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${music.volume ?? .15},atrim=0:${total}[mus]`);
    if (music.duck !== false) {
      parts.push("[voice]asplit=2[vk][vs]", "[mus][vs]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[duck]",
        "[vk][duck]amix=inputs=2:normalize=0:duration=first[mixed]");
    } else parts.push("[voice][mus]amix=inputs=2:normalize=0:duration=first[mixed]");
    last = "mixed";
  }
  parts.push(`[${last}]afade=t=out:st=${Math.max(0, total - 1).toFixed(3)}:d=1[out]`);
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.join(";"), "-map", "[out]",
    "-c:a", "aac", "-b:a", "192k", "-t", String(total), out]);
  return out;
}

/** Put an audio file under a silent video (video stream copied, not re-encoded). */
export async function mux(video, audio, out) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", out]);
  return out;
}

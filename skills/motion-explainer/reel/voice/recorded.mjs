// Recorded voice: the user's own files. Either one file per scene (scene "voice": "vo/01.wav", relative to reel/),
// or one track for the whole reel (audio.voice.file), which keeps the scene durations as they are.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { seconds } from "./provider.mjs";

export default {
  name: "recorded",
  async check(opts, dir) {
    return opts.file && !existsSync(resolve(dir, opts.file)) ? [`audio.voice.file: ${opts.file} not found`] : [];
  },
  async track(opts, dir) {
    if (!opts.file) return null;
    const file = resolve(dir, opts.file);
    return { file, seconds: await seconds(file) };
  },
  async synthesize({ scene, index, dir }) {
    if (!scene.voice) throw new Error(`scenes[${index}]: recorded voice needs "voice": "<file>" on the scene (or audio.voice.file for one track)`);
    const file = resolve(dir, scene.voice);
    if (!existsSync(file)) throw new Error(`scenes[${index}]: ${scene.voice} not found (record it from SCRIPT.md)`);
    return { file, seconds: await seconds(file) };
  },
};

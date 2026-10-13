// Piper: free, offline neural TTS (https://github.com/rhasspy/piper). Options (audio.voice):
//   model   path to a voice .onnx (its .onnx.json next to it), relative to reel/   required
//   bin     the piper executable (default "piper", e.g. a venv's bin/piper)
//   speaker speaker id for multi-speaker voices;  rate  >1 slower, <1 faster (piper --length_scale)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { have, run, seconds } from "./provider.mjs";

export default {
  name: "piper",
  async check(opts, dir) {
    const bad = [];
    const bin = opts.bin ? resolve(dir, opts.bin) : "piper";
    if (!(opts.bin ? existsSync(bin) : await have("piper"))) bad.push(`piper not found (${bin}); install: pip install piper-tts, or set audio.voice.bin`);
    if (!opts.model) bad.push("audio.voice.model: path to a Piper voice .onnx is required");
    else if (!existsSync(resolve(dir, opts.model))) bad.push(`audio.voice.model: ${opts.model} not found`);
    return bad;
  },
  async synthesize({ text, out, opts, dir }) {
    const file = `${out}.wav`;
    const args = ["--model", resolve(dir, opts.model), "--output_file", file];
    if (opts.speaker !== undefined) args.push("--speaker", String(opts.speaker));
    if (opts.rate !== undefined) args.push("--length_scale", String(opts.rate));
    await run(opts.bin ? resolve(dir, opts.bin) : "piper", args, { input: text });
    return { file, seconds: await seconds(file) };
  },
};

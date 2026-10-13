// Your own TTS command, e.g. a cloud voice. Options (audio.voice):
//   command  shell command template; placeholders {out} (file to write), {text_file} (UTF-8 text), {text}, {index}
//   ext      extension of the file the command writes (default "wav"; "mp3" for most cloud APIs)
// Values are shell-quoted when substituted. API keys stay in your environment (the command reads them itself);
// never put a key in scenes.json.
import { writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { run, seconds, shq } from "./provider.mjs";

export default {
  name: "command",
  async check(opts) {
    if (!opts.command) return ['audio.voice.command: a command template is required, e.g. "my-tts --out {out} --in {text_file}"'];
    return /\{out\}/.test(opts.command) ? [] : ["audio.voice.command: must contain {out}, where the command writes the audio"];
  },
  async synthesize({ text, index, out, opts, dir }) {
    const file = `${out}.${opts.ext ?? "wav"}`, textFile = `${out}.txt`;
    await writeFile(textFile, text);
    const vars = { out: file, text_file: textFile, text, index: String(index) };
    const cmd = opts.command.replace(/\{(out|text_file|text|index)\}/g, (_, k) => shq(vars[k]));
    try { await run(cmd, [], { shell: true, cwd: dir }); } finally { await unlink(textFile).catch(() => {}); }
    if (!existsSync(file)) throw new Error(`audio.voice.command ran but wrote no ${file}`);
    return { file, seconds: await seconds(file) };
  },
};

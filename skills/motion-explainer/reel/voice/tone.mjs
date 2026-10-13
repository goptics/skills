// Placeholder voice: a soft tone as long as the text would take to say (words / rate, default 2.5 words/s).
// For checking timing and pacing before a real voice exists. Options: rate (words per second).
import { run, seconds } from "./provider.mjs";

export default {
  name: "tone",
  async synthesize({ text, out, opts }) {
    const file = `${out}.wav`, words = text.trim().split(/\s+/).filter(Boolean).length;
    const len = Math.max(.5, words / (opts.rate ?? 2.5));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=330:duration=${len.toFixed(3)}`,
      "-af", "volume=0.08", "-ar", "22050", "-ac", "1", file]);
    return { file, seconds: await seconds(file) };
  },
};

// Voice provider contract + registry. A provider turns one scene's `say` text into one audio clip.
//
//   export default {
//     name: "piper",
//     check?(opts, dir)        → Promise<string[]>   problems that stop synthesis (missing binary, model, file); [] = ok
//     synthesize({ scene, index, text, out, opts, dir })
//                              → Promise<{ file, seconds }>   out = path without extension; file = the clip written
//     track?(opts, dir)        → Promise<{ file, seconds } | null>   optional: one ready-made track for the whole reel
//   }
//
// Providers live in voice/<name>.mjs and are found by name ("provider" in scenes.json audio.voice), so a new voice is a
// new file. register() adds one in-process (tests, custom code). Providers only make clips: timing, captions and mixing
// are audio.mjs's job.
import { spawn } from "node:child_process";

const registry = new Map();

/** Add a provider in-process (it wins over a file of the same name). */
export function register(p) {
  if (!p?.name || typeof p.synthesize !== "function") throw new Error("a provider needs a name and synthesize()");
  registry.set(p.name, p);
  return p;
}

/** The provider called `name`: registered, else voice/<name>.mjs. */
export async function provider(name) {
  if (registry.has(name)) return registry.get(name);
  if (!/^[a-z][a-z0-9-]*$/.test(name ?? "")) throw new Error(`voice provider name "${name}" must be lowercase letters, digits, "-"`);
  let mod;
  try { mod = await import(new URL(`./${name}.mjs`, import.meta.url)); } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND") throw new Error(`no voice provider "${name}" (expected voice/${name}.mjs)`);
    throw err;
  }
  return register(mod.default);
}

/** Run a program; resolves with stdout, rejects with its stderr on a non-zero exit. */
export function run(cmd, args, { input, shell = false, cwd } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { shell, cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", e => fail(new Error(`${cmd}: ${e.code === "ENOENT" ? "not found" : e.message}`)));
    p.on("close", c => (c ? fail(new Error(`${shell ? "command" : cmd} exited ${c}: ${err.trim().split("\n").slice(-3).join(" | ")}`)) : ok(out)));
    p.stdin.end(input ?? "");
  });
}

/** Length of an audio file in seconds (ffprobe). */
export async function seconds(file) {
  const s = Number(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));
  if (!(s > 0)) throw new Error(`${file}: no audio duration (not an audio file?)`);
  return s;
}

/** Is a program on PATH (or an existing path)? */
export async function have(cmd) {
  return run(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [cmd] : ["-c", `command -v "$0"`, cmd])
    .then(() => true, () => false);
}

/** POSIX shell single-quoting, for values put into a command template. */
export const shq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

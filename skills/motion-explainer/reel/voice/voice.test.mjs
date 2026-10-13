// Contract test: every voice provider honours the same contract. node --test voice/voice.test.mjs
// Piper runs when PIPER_MODEL (and PIPER_BIN, if piper isn't on PATH) are set; otherwise it is skipped, loudly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provider, register, run } from "./provider.mjs";

const dir = mkdtempSync(join(tmpdir(), "voice-test-"));
const scene = { title: "Basic usage", say: "One event loop wakes on every add and hands the job to a free worker." };
const tone = async (file, len) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=duration=${len}`, file]);
await tone(join(dir, "s0.wav"), 1.5);

const cases = {
  tone: { provider: "tone" },
  recorded: { provider: "recorded", scene: { ...scene, voice: "s0.wav" } },
  command: { provider: "command", command: "ffmpeg -y -loglevel error -f lavfi -i sine=duration=1.2 {out}" },
  piper: { provider: "piper", model: process.env.PIPER_MODEL, ...(process.env.PIPER_BIN && { bin: process.env.PIPER_BIN }) },
};

for (const [name, opts] of Object.entries(cases)) {
  test(`${name}: synthesize() returns { file, seconds } for a real audio file`, async t => {
    if (name === "piper" && !process.env.PIPER_MODEL) return t.skip("set PIPER_MODEL=/path/voice.onnx (and PIPER_BIN) to run");
    const p = await provider(name);
    assert.equal(p.name, name);
    assert.deepEqual(await (p.check?.(opts, dir) ?? []), []);
    const r = await p.synthesize({ scene: opts.scene ?? scene, index: 0, text: scene.say, out: join(dir, `${name}-0`), opts, dir });
    assert.deepEqual(Object.keys(r).sort(), ["file", "seconds"]);
    assert.ok(existsSync(r.file), r.file);
    assert.ok(r.seconds > 0.4 && r.seconds < 30, `${r.seconds}s`);
  });
}

test("tone length follows the words (2.5 words/s)", async () => {
  const r = await (await provider("tone")).synthesize({ text: "one two three four five", out: join(dir, "five"), opts: {} });
  assert.ok(Math.abs(r.seconds - 2) < 0.05, `${r.seconds}`);
});

test("clear errors: unknown provider, bad name, missing recording, command without {out}", async () => {
  await assert.rejects(provider("nope"), /no voice provider "nope"/);
  await assert.rejects(provider("../x"), /must be lowercase/);
  const rec = await provider("recorded");
  await assert.rejects(rec.synthesize({ scene: { say: "x" }, index: 3, opts: {}, dir }), /scenes\[3\]: recorded voice needs "voice"/);
  await assert.rejects(rec.synthesize({ scene: { voice: "missing.wav" }, index: 1, opts: {}, dir }), /missing.wav not found/);
  assert.match((await (await provider("command")).check({ command: "say hi" })).join(), /must contain \{out\}/);
  assert.match((await (await provider("piper")).check({ bin: "nope/piper" }, dir)).join(), /piper not found.*model.*required/s);
});

test("command quotes substituted values (no shell injection through the text)", async () => {
  const p = await provider("command");
  const opts = { command: "printf %s {text} > {out}.txt && ffmpeg -y -loglevel error -f lavfi -i sine=duration=0.6 {out}" };
  const canary = join(dir, "INJECTED");
  const r = await p.synthesize({ text: `it's $(touch ${canary}) fine; \`touch ${canary}\``, index: 0, out: join(dir, "inj"), opts, dir });
  assert.ok(r.seconds > 0.5);
  assert.ok(!existsSync(canary), "text was executed by the shell");
});

test("register() adds an in-process provider that wins by name", async () => {
  register({ name: "fake", synthesize: async () => ({ file: "x.wav", seconds: 1 }) });
  assert.deepEqual(await (await provider("fake")).synthesize({}), { file: "x.wav", seconds: 1 });
  assert.throws(() => register({ name: "broken" }), /needs a name and synthesize/);
});

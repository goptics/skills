// node --test core.test.mjs   (engine check; not copied into projects)
import { test } from "node:test";
import assert from "node:assert/strict";
import { highlight, pickSize, srt, timeline, viewBox } from "./core.mjs";

test("highlight keeps token classes right with and without packages", () => {
  assert.equal(highlight("x := f(1) // c", "go"), 'x := <span class="fn">f</span>(<span class="num">1</span>) <span class="com">// c</span>');
  assert.equal(highlight("fmt.Println(⟦2⟧)", "go", ["fmt"]),
    '<span class="pkg">fmt</span>.<span class="fn">Println</span>(<mark><span class="num">2</span></mark>)');
  assert.equal(highlight('def f(): return "s"  # c', "python"),
    '<span class="kw">def</span> <span class="fn">f</span>(): <span class="kw">return</span> <span class="str">"s"</span>  <span class="com"># c</span>');
  assert.equal(highlight("go get github.com/x/y", "sh"), '<span class="fn">go get</span> github.com/x/y');
  assert.equal(highlight("a < b", "text"), "a &lt; b");
});

test("timeline, srt, sizes, viewBox", () => {
  const { scenes, total } = timeline({ scenes: [{ duration: 13, caption: "One <code>Add()</code>" }, { duration: 4, type: "outro" }] });
  assert.equal(total, 17);
  assert.deepEqual(scenes.map(s => [s.start, s.end]), [[0, 13], [13, 17]]);
  assert.equal(srt(scenes), "1\n00:00:01,200 --> 00:00:12,700\nOne Add()\n");
  assert.equal(pickSize({}, undefined), "9:16");
  assert.equal(pickSize({ size: "16:9" }, "1:1"), "1:1");
  assert.throws(() => pickSize({}, "4:3"), /unknown size 4:3/);
  assert.deepEqual(viewBox('<svg viewBox="0 0 960 370">'), [960, 370]);
});

test("validate: v1 files pass, v2 fields checked, unknown keys reported", async () => {
  const { validate, slideOf, scriptMarkdown } = await import("./core.mjs");
  const ok = { scenes: [{ duration: 13, title: "Basic", code: "x", diagram: "../a.svg", say: "Hi.", steps: [1, 2.5] },
                        { duration: 4, type: "outro", say: "Bye." }],
               audio: { voice: { provider: "piper" } } };
  assert.deepEqual(validate(ok), []);
  assert.deepEqual(validate({ scenes: [{ duration: 3 }] }), []);
  const bad = validate({ scenes: [{ duration: 0, steps: [2, 1], sya: "typo" }], audio: { voice: { provider: "tts" } }, extra: 1 });
  assert.equal(bad.length, 6, bad.join("\n"));
  assert.match(bad.join("\n"), /unknown top-level key "extra"/);
  assert.match(bad.join("\n"), /unknown key "sya"/);
  assert.match(bad.join("\n"), /steps must be increasing/);
  assert.match(bad.join("\n"), /steps need a diagram/);
  assert.match(bad.join("\n"), /"tts" is not recorded, piper or command/);

  assert.deepEqual(slideOf({ title: "A", say: "spoken", slide: { title: "A, longer" } }), { title: "A, longer", say: "spoken", notes: "spoken" });
  assert.equal(slideOf({ say: "x", slide: { notes: "own" } }).notes, "own");

  const md = scriptMarkdown({ title: "T", scenes: ok.scenes });
  assert.match(md, /^# T: voice-over script \(17s\)/);
  assert.match(md, /\| 0:00–0:13 \| 1 · Basic \| "Hi\." \|/);
  assert.match(md, /\| 0:13–0:17 \| Outro \| "Bye\." \|/);
  assert.match(scriptMarkdown({ scenes: [{ duration: 59.6 }] }), /\| 0:00–1:00 \|/);
});

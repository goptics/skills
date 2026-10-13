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

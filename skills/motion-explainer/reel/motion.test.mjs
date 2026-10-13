// node --test motion.test.mjs   (engine check; not copied into projects)
import { test } from "node:test";
import assert from "node:assert/strict";
import { easing, sample } from "./motion.mjs";

test("easing matches CSS timing functions", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} vs ${b}`);
  near(easing("linear")(0.3), 0.3);
  near(easing("ease-in-out")(0.5), 0.5);
  near(easing("cubic-bezier(.65, 0, .35, 1)")(0.25), 0.0708);   // slow start
  near(easing("ease")(1), 1);
  assert.equal(easing("steps(4)")(0.3), 0.25);
  assert.equal(easing("steps(4, start)")(0.3), 0.5);
});

test("sample interpolates per property, wraps the loop, uses base values for missing ends", () => {
  const doc = { D: 10, tracks: {
    dot: { easing: "linear", props: { opacity: [[0, 0], [50, 1], [100, 1]], transform: [[0, "translate(0px, 0px)"], [100, "translate(100px, 20px)"]] } },
    tint: { easing: "linear", props: { fill: [[20, "var(--a)"], [60, "var(--b)"]] } },
  } };
  const color = v => ({ "var(--a)": [0, 0, 0, 1], "var(--b)": [200, 100, 0, 1], base: [100, 100, 100, 1] })[v];
  const s = sample(doc, 2.5, { color, base: () => "base" });
  assert.equal(s.dot.opacity, 0.5);
  assert.equal(s.dot.transform, "translate(25px, 5px)");
  assert.equal(s.tint.fill, "rgba(25, 13, 0, 1)");                       // 25%: 1/8 of the way from 20% to 60%
  assert.equal(sample(doc, 12.5, { color, base: () => "base" }).dot.transform, "translate(25px, 5px)");   // wraps
  assert.equal(sample(doc, 1, { color, base: () => "base" }).tint.fill, "rgba(50, 50, 50, 1)");        // base → --a
});

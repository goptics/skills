// Replays a <slug>.motion.json (written by kfu.py) at any time t, the way the browser plays the SVG's CSS keyframes:
// per property, between the keyframes that set it, with the element's timing function applied per segment.
// DOM-free: colours (and other values that need the page, like var(--x)) are resolved by a callback.
//
//   const doc = await (await fetch("x.motion.json")).json();
//   const styles = sample(doc, t, { base, color });   // { elementId: { opacity: 0.4, transform: "translate(…)", fill: "rgba(…)" } }
//
// base(id, prop)  → the element's own value where a track doesn't set 0% / 100% (CSS uses the element's style there)
// color(value)    → [r, g, b, a] (0-255, a 0-1) for colour values such as "var(--job)" or "#1a7f37"

const NAMED = { linear: [0, 0, 1, 1], ease: [.25, .1, .25, 1], "ease-in": [.42, 0, 1, 1], "ease-out": [0, 0, .58, 1], "ease-in-out": [.42, 0, .58, 1] };

/** Timing function for a CSS easing string: linear, ease*, cubic-bezier(…), steps(n[, end|start]). */
export function easing(spec) {
  const steps = spec.match(/^steps\(\s*(\d+)\s*(?:,\s*(\w+(?:-\w+)?))?\s*\)$/);
  if (steps) {
    const n = +steps[1], start = /start/.test(steps[2] ?? "");
    return x => Math.min(1, Math.floor(x * n + (start ? 1 : 0)) / n);
  }
  const m = spec.match(/^cubic-bezier\(([^)]*)\)$/);
  const [x1, y1, x2, y2] = m ? m[1].split(",").map(Number) : NAMED[spec] ?? NAMED.ease;
  if (x1 === y1 && x2 === y2) return x => x;
  const bez = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => {                      // solve bezX(t) = x by bisection (monotonic in t), then return bezY(t)
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bez(x1, x2, mid) < x) lo = mid; else hi = mid; }
    return bez(y1, y2, (lo + hi) / 2);
  };
}

const COLOR_PROPS = new Set(["fill", "stroke", "color", "stop-color", "background-color"]);
const NUM = /-?\d*\.?\d+(?:e-?\d+)?/gi;

/** Interpolated value between a and b at progress p (0-1), as CSS would: numbers, number-for-number in same-shape
 *  strings (transforms), colours in RGBA; anything else switches at p = 0.5 (CSS discrete animation). */
function mix(prop, a, b, p, color) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * p;
  if (COLOR_PROPS.has(prop)) {
    const [ca, cb] = [color(String(a)), color(String(b))];
    const c = ca.map((v, i) => v + (cb[i] - v) * p);
    return `rgba(${c.slice(0, 3).map(Math.round).join(", ")}, ${+c[3].toFixed(4)})`;
  }
  const [sa, sb] = [String(a), String(b)];
  if (sa.replace(NUM, "#") === sb.replace(NUM, "#")) {
    const nb = sb.match(NUM) ?? [];
    let i = 0;
    return sa.replace(NUM, x => { const v = +x + (+nb[i++] - +x) * p; return String(+v.toFixed(4)); });
  }
  return p < .5 ? a : b;
}

/** Styles of every animated element at t seconds (wraps around the loop). */
export function sample(doc, t, { base = () => undefined, color = () => [0, 0, 0, 1] } = {}) {
  const pct = ((t % doc.D) + doc.D) % doc.D / doc.D * 100;
  const out = {};
  for (const [id, track] of Object.entries(doc.tracks)) {
    const ease = easing(track.easing), style = (out[id] = {});
    for (const [prop, kfs] of Object.entries(track.props)) {
      let seq = kfs;
      if (seq[0][0] > 0) seq = [[0, base(id, prop)], ...seq];             // implicit 0%: the element's own value
      if (seq.at(-1)[0] < 100) seq = [...seq, [100, base(id, prop)]];      // implicit 100%
      let i = seq.findIndex((k, j) => j + 1 < seq.length && pct >= k[0] && pct <= seq[j + 1][0]);
      if (i < 0) i = seq.length - 2;
      const [[p0, v0], [p1, v1]] = [seq[i], seq[i + 1]];
      if (v0 === undefined || v1 === undefined) continue;                  // no own value known: leave it to CSS
      style[prop] = p1 === p0 ? v1 : mix(prop, v0, v1, ease((pct - p0) / (p1 - p0)), color);
    }
  }
  return out;
}

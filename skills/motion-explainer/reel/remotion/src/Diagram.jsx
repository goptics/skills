// A diagram at time t, driven by Remotion's frame: motion.json replayed with motion.mjs (same tracks and easing as the
// SVG's CSS), drawn as an <Img> of the static SVG with that frame's styles injected. Each diagram keeps its own CSS
// (an image can't leak styles into the page). Dark theme pinned, reduced motion off, as in the built-in engine.
import { useLayoutEffect, useMemo, useState } from "react";
import { Img, continueRender, delayRender } from "remotion";
import { sample } from "../../motion.mjs";

const pinDark = svg => svg.replace(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/g, "@media all")
  .replace(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g, "@media not all");
const dataUri = svg => "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

/** Base values and colours need the browser's CSS: read them once from a hidden copy in a shadow root. */
function useProbe(doc, svg) {
  const [probe, setProbe] = useState(null);
  const [handle] = useState(() => delayRender("probe diagram styles"));
  useLayoutEffect(() => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-99999px;top:0";
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = svg.replace(/:root\b/g, ":host");
    const el = root.querySelector("svg"), dot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    el.append(dot);
    const colors = {}, base = {};
    const color = v => {
      if (!(v in colors)) {
        dot.style.fill = v;
        const m = getComputedStyle(dot).fill.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
        colors[v] = [m[0], m[1], m[2], m[3] ?? 1];
      }
      return colors[v];
    };
    for (const [id, track] of Object.entries(doc.tracks)) {
      const node = root.getElementById(id);
      for (const [prop, kfs] of Object.entries(track.props)) {
        if (kfs[0][0] > 0 || kfs.at(-1)[0] < 100) base[`${id}|${prop}`] = node ? getComputedStyle(node).getPropertyValue(prop) : undefined;
        for (const [, v] of kfs) if (/^(fill|stroke|color|stop-color)$/.test(prop)) color(String(v));
      }
    }
    for (const v of Object.values(base)) if (v) color(v);
    host.remove();
    setProbe({ colors, base });
    continueRender(handle);
  }, [doc, svg, handle]);
  return probe;
}

const NONE = [];

export function Diagram({ doc, t, hide = NONE, style }) {
  const hideKey = hide.join(",");
  const svg = useMemo(() => pinDark(doc.svg).replace("</style>", `${hideKey ? `${hideKey}{display:none}` : ""}</style>`), [doc, hideKey]);
  const probe = useProbe(doc, svg);
  const frameSvg = useMemo(() => {
    if (!probe) return svg;
    const styles = sample(doc, t, { base: (id, prop) => probe.base[`${id}|${prop}`] || undefined, color: v => probe.colors[v] ?? [0, 0, 0, 1] });
    const rules = Object.entries(styles).map(([id, p]) => `#${id}{${Object.entries(p).map(([k, v]) => `${k}:${v} !important`).join(";")}}`).join("");
    return svg.replace("</style>", `${rules}</style>`);
  }, [svg, probe, doc, t]);
  return probe ? <Img src={dataUri(frameSvg)} style={{ display: "block", ...style }} /> : null;
}

// One scene as DOM, shared by the reel (index.html) and the slides (slides.html): markup, layout, and the entrance
// tweens (relative to the scene's start). Needs a page with reel.css; layout numbers come from core.mjs LAYOUTS.
import { highlight, viewBox } from "./core.mjs";

const sizeOf = async src => viewBox(await (await fetch(src)).text());

/** A .scene element for s, appended to stage and laid out for L. Diagrams are same-origin iframes. */
export async function sceneElement(stage, s, R, L) {
  const el = document.createElement("div"), pkgs = R.packages ?? [];
  el.className = "scene";
  stage.appendChild(el);
  if (s.type === "outro") {
    el.innerHTML = `<div class="center">${s.logo ? `<img src="${s.logo}" alt="">` : ""}
      ${s.code ? `<pre>${highlight(s.code, s.lang ?? "sh", pkgs)}</pre>` : ""}
      ${(s.lines ?? []).map(l => `<div class="line">${l}</div>`).join("")}</div>`;
    return el;
  }
  const lines = s.code ? s.code.split("\n").map(l => `<span class="ln">${highlight(l, s.lang ?? R.lang, pkgs)}</span>`).join("")
    : (s.points ?? []).map(p => `<div class="ln">${p}</div>`).join("");
  el.innerHTML = `<div class="head">${s.step ? `<span class="chip">${s.step}</span>` : ""}<div class="title">${s.title ?? ""}</div></div>
    <div class="body">${s.code ? `<pre>${lines}</pre>` : `<div class="points">${lines}</div>`}
    ${s.diagram ? `<iframe class="diagram" src="${s.diagram}" scrolling="no" tabindex="-1"></iframe>` : ""}
    ${s.caption ? `<div class="cap">${s.caption}</div>` : ""}</div>`;
  Object.assign(el.querySelector(".head").style, { left: `${L.head[0]}px`, right: `${L.head[0]}px`, top: `${L.head[1]}px` });
  await place(el, L, s.diagram && await sizeOf(s.diagram));
  return el;
}

// Stack (9:16, 1:1): panel, diagram at the panel's width, caption, top to bottom.
// Side (16:9): panel left, diagram right, caption under both. Either way the body shrinks to fit above the safe zone.
async function place(el, L, dsize) {
  const body = el.querySelector(".body"), panel = el.querySelector("pre, .points"), d = el.querySelector(".diagram"), cap = el.querySelector(".cap");
  body.style.top = `${L.top}px`;
  const inner = L.W - 2 * L.pad;
  let bottom;
  if (L.mode === "stack" || !d) {
    Object.assign(panel.style, { left: `${L.pad}px`, right: `${L.pad}px`, top: "0px" });
    bottom = panel.offsetHeight;
    if (d) {
      const k = inner / dsize[0];
      Object.assign(d.style, { left: `${L.pad}px`, top: `${bottom + 44}px`, width: `${dsize[0]}px`, height: `${dsize[1]}px`, transform: `scale(${+k.toFixed(4)})` });
      bottom += 44 + dsize[1] * +k.toFixed(4);
    }
  } else {
    Object.assign(panel.style, { left: `${L.pad}px`, width: `${L.split}px`, top: "0px" });
    const left = L.pad + L.split + 40, k = (L.W - L.pad - left) / dsize[0];
    Object.assign(d.style, { left: `${left}px`, top: "0px", width: `${dsize[0]}px`, height: `${dsize[1]}px`, transform: `scale(${+k.toFixed(4)})` });
    bottom = Math.max(panel.offsetHeight, dsize[1] * k);
  }
  if (cap) {
    Object.assign(cap.style, { left: `${L.capInset[0]}px`, right: `${L.capInset[1]}px`, top: `${bottom + 48}px` });
    bottom += 48 + cap.offsetHeight;
  }
  const room = L.H - L.safe - L.top;
  if (bottom > room) body.style.transform = `scale(${room / bottom})`;
  else if (L.mode === "side") body.style.top = `${L.top + (room - bottom) / 2}px`;   // wide frame: centre the block
}

/** Entrance tweens of a scene, as [element, keyframes, delay s, duration s, easing]; skip = already entered. */
export function entrances(el, { skip = false } = {}) {
  const e = skip ? -9 : 0, out = [], ease = "cubic-bezier(.2, .7, .2, 1)";
  el.querySelectorAll(".ln").forEach((ln, i) =>
    out.push([ln, [{ opacity: 0, transform: "translateX(-16px)" }, { opacity: 1, transform: "none" }], e + .3 + i * .12, .35, ease]));
  const line = getComputedStyle(document.documentElement).getPropertyValue("--mark-line").trim();
  el.querySelectorAll("mark").forEach(mk =>
    out.push([mk, [{ outlineColor: "transparent" }, { outlineColor: line }, { outlineColor: "transparent" }], 1.6, 1.4, ease]));
  const d = el.querySelector(".diagram"), c = el.querySelector(".cap");
  if (d) out.push([d, [{ opacity: 0 }, { opacity: 1 }], e + .6, .5, ease]);
  if (c) out.push([c, [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], e + 1.2, .5, ease]);
  return out;
}

/** Diagrams follow prefers-color-scheme and prefers-reduced-motion; pin them to dark + full motion. */
export function pinDiagram(doc) {
  for (const sheet of doc.styleSheets) for (const rule of sheet.cssRules) {
    if (!rule.media) continue;
    if (rule.media.mediaText.includes("prefers-color-scheme: dark")) rule.media.mediaText = "all";
    if (rule.media.mediaText.includes("prefers-reduced-motion")) rule.media.mediaText = "not all";
  }
}

/** Resolves when an iframe's document is loaded (and pinned). */
export const diagramReady = el => new Promise(ok => {
  const done = () => { pinDiagram(el.contentDocument); ok(el); };
  el.contentDocument?.readyState === "complete" && el.contentDocument.styleSheets.length ? done() : el.addEventListener("load", done, { once: true });
});

// The reel as a Remotion composition: same scenes.json, layout, CSS and highlighter as index.html (core.mjs, reel.css),
// with every motion computed from the current frame (no CSS or Web Animations running on their own).
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Easing, Sequence, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { LAYOUTS, highlight, timeline, viewBox } from "../../core.mjs";
import { Diagram } from "./Diagram.jsx";

const OUT = Easing.bezier(.2, .7, .2, 1);          // index.html's entrance easing
const clamp = x => Math.min(1, Math.max(0, x));
/** Progress 0-1 of a tween that starts at `start` and lasts `dur` seconds (before: 0, after: 1). */
const tween = (t, start, dur, ease = OUT) => ease(clamp((t - start) / dur));

/** index.html's scene in/out: 0.35 s fade + 24 px slide at both ends; the first scene is already on screen at t=0. */
function sceneStyle(t, s) {
  const len = s.end - s.start, local = t - s.start, f = .35;
  if (local < f && s.start > 0) { const p = local / f; return { opacity: p, transform: `translateY(${24 * (1 - p)}px)` }; }
  if (local > len - f) { const p = (local - (len - f)) / f; return { opacity: 1 - p, transform: `translateY(${-24 * p}px)` }; }
  return { opacity: 1, transform: "none" };
}

/** Remotion-only camera: zoom into focus.box (diagram units) between focus.at[0] and focus.at[1] (scene seconds),
 *  easing in and out over 0.6 s. Outside the window the diagram is shown whole. */
function focusTransform(focus, local, [w, h] = [0, 0]) {
  if (!focus) return "none";
  const [from, to] = focus.at, [bx, by, bw, bh] = focus.box, ease = Easing.bezier(.65, 0, .35, 1);
  const p = Math.min(ease(clamp((local - from) / .6)), ease(clamp((to - local) / .6)));
  if (p <= 0) return "none";
  const k = Math.min(w / bw, h / bh), s = 1 + (k - 1) * p;
  const tx = (w / 2 - (bx + bw / 2) * k) * p, ty = (h / 2 - (by + bh / 2) * k) * p;
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
}

/** Measures the panel and caption once, then places them like index.html's place(): stack (9:16, 1:1) or side (16:9). */
function useLayout(L, s, dsize) {
  const panel = useRef(), cap = useRef();
  const [box, setBox] = useState(null);
  const [handle] = useState(() => delayRender("measure scene"));
  useLayoutEffect(() => { document.fonts.ready.then(() => {
    const ph = panel.current.offsetHeight, ch = cap.current?.offsetHeight ?? 0, inner = L.W - 2 * L.pad;
    const out = { top: L.top, scale: 1 };
    let bottom;
    if (L.mode === "stack" || !dsize) {
      bottom = ph;
      if (dsize) {
        const k = +(inner / dsize[0]).toFixed(4);
        out.diagram = { left: L.pad, top: bottom + 44, k };
        bottom += 44 + dsize[1] * k;
      }
    } else {
      const left = L.pad + L.split + 40, k = +((L.W - L.pad - left) / dsize[0]).toFixed(4);
      out.diagram = { left, top: 0, k };
      bottom = Math.max(ph, dsize[1] * ((L.W - L.pad - left) / dsize[0]));
    }
    if (cap.current) { out.capTop = bottom + 48; bottom += 48 + ch; }
    const room = L.H - L.safe - L.top;
    if (bottom > room) out.scale = room / bottom;
    else if (L.mode === "side") out.top = L.top + (room - bottom) / 2;
    setBox(out);
    continueRender(handle);
  }); }, [L, dsize, handle]);
  return { panel, cap, box };
}

function Scene({ s, R, L, motions, assets, t }) {
  const pkgs = R.packages ?? [], doc = s.diagram ? motions[s.diagram] : null;
  const dsize = useMemo(() => (doc ? viewBox(doc.svg) : null), [doc]);
  const { panel, cap, box } = useLayout(L, s, dsize);
  const enter = s.start ? 0 : -9;                    // first scene: entrances already done at frame 0
  const lines = s.code ? s.code.split("\n").map(l => highlight(l, s.lang ?? R.lang, pkgs)) : s.points ?? [];
  const markP = tween(t, s.start + 1.6, 1.4, Easing.bezier(.2, .7, .2, 1));
  const markA = markP < .5 ? markP * 2 : 2 - markP * 2;  // transparent → line colour → transparent
  const lineStyle = i => { const p = tween(t, s.start + enter + .3 + i * .12, .35); return { opacity: p, transform: p < 1 ? `translateX(${-16 * (1 - p)}px)` : "none" }; };
  const Panel = s.code ? "pre" : "div";
  // horizontal geometry is known up front (so text wraps right when measured); vertical comes from measuring
  const panelPos = L.mode === "stack" || !dsize ? { left: L.pad, right: L.pad, top: 0 } : { left: L.pad, width: L.split, top: 0 };
  const capPos = { left: L.capInset[0], right: L.capInset[1], top: box?.capTop ?? 0 };
  const capP = tween(t, s.start + enter + 1.2, .5);
  return (
    <div className="scene" style={sceneStyle(t, s)}>
      <style>{`.scene mark{outline-color:rgba(210,153,34,${markA.toFixed(4)})}`}</style>
      <div className="head" style={{ left: L.head[0], right: L.head[0], top: L.head[1] }}>
        {s.step && <span className="chip">{s.step}</span>}<div className="title">{s.title ?? ""}</div>
      </div>
      <div className="body" style={{ top: box?.top ?? L.top, transform: box && box.scale < 1 ? `scale(${box.scale})` : undefined }}>
        <Panel ref={panel} className={s.code ? undefined : "points"} style={panelPos}>
          {lines.map((html, i) => s.code
            ? <span key={i} className="ln" style={lineStyle(i)} dangerouslySetInnerHTML={{ __html: html }} />
            : <div key={i} className="ln" style={lineStyle(i)} dangerouslySetInnerHTML={{ __html: html }} />)}
        </Panel>
        {doc && box?.diagram && (
          <div className="diagram" style={{ left: box.diagram.left, top: box.diagram.top, width: dsize[0], height: dsize[1], overflow: "hidden",
            transform: `scale(${box.diagram.k})`, opacity: tween(t, s.start + enter + .6, .5) }}>
            <div style={{ transformOrigin: "0 0", transform: focusTransform(s.focus, t - s.start, dsize) }}>
              <Diagram doc={doc} t={Math.max(0, t - s.start + (s.offset ?? 0))} />
            </div>
          </div>
        )}
        {s.caption && <div ref={cap} className="cap" style={{ ...capPos, opacity: capP, transform: capP < 1 ? `translateY(${16 * (1 - capP)}px)` : "none" }}
          dangerouslySetInnerHTML={{ __html: s.caption }} />}
      </div>
    </div>
  );
}

function Outro({ s, R, assets, t }) {
  return (
    <div className="scene" style={sceneStyle(t, s)}>
      <div className="center">
        {s.logo && <img src={assets[s.logo]} alt="" />}
        {s.code && <pre dangerouslySetInnerHTML={{ __html: highlight(s.code, s.lang ?? "sh", R.packages ?? []) }} />}
        {(s.lines ?? []).map((l, i) => <div key={i} className="line" dangerouslySetInnerHTML={{ __html: l }} />)}
      </div>
    </div>
  );
}

export function Reel({ R, size, motions, assets, css }) {
  const frame = useCurrentFrame(), { fps } = useVideoConfig(), t = frame / fps;
  const L = LAYOUTS[size], { scenes, total } = timeline(R);
  const vars = Object.fromEntries([["title", L.title], ["chip", L.chip], ["code", L.code], ["cap", L.cap]].map(([k, v]) => [`--${k}`, `${v}px`]));
  return (
    <AbsoluteFill>
      <style>{css.reel ?? ""}{Object.entries(R.colors ?? {}).map(([k, v]) => `:root{--${k}:${v}}`).join("")}</style>
      <div id="stage" style={{ width: L.W, height: L.H, ...vars }}>
        <div id="progress" style={{ transform: `scaleX(${clamp(t / total)})` }} />
        {scenes.map((s, i) => (
          <Sequence key={i} from={Math.round(s.start * fps)} durationInFrames={Math.max(1, Math.round((s.end - s.start) * fps))} layout="none">
            {s.type === "outro" ? <Outro s={s} R={R} assets={assets} t={t} /> : <Scene s={s} R={R} L={L} motions={motions} assets={assets} t={t} />}
          </Sequence>
        ))}
      </div>
    </AbsoluteFill>
  );
}

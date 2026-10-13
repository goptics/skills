// Cover still: same scenes.json "cover" block, layout (core.mjs COVERS) and CSS (cover.css) as cover.html.
import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { COVERS, viewBox } from "../../core.mjs";
import { Diagram } from "./Diagram.jsx";

const LEGEND = ["g:has(> .lg)"];   // kfu legends: cropped on a cover anyway, so hidden

export function Cover({ R, size, motions, assets, css }) {
  const S = COVERS[size], C = R.cover ?? {}, doc = C.diagram ? motions[C.diagram] : null;
  const col = useRef();
  const [k, setK] = useState(1);
  const [handle] = useState(() => delayRender("measure cover"));
  useLayoutEffect(() => {   // measure once fonts and images are in, as cover.html does
    const el = col.current;
    Promise.all([document.fonts.ready, ...[...el.querySelectorAll("img")].map(i => i.decode().catch(() => {}))]).then(() => {
      const room = S.band[1] - S.band[0];
      setK(Math.min(1, room / el.offsetHeight, S.W * .96 / el.offsetWidth));
      continueRender(handle);
    });
  }, [S, handle]);
  const vars = Object.fromEntries(["h1", "logo", "chip", "foot", "gap"].map(x => [`--${x}`, `${S[x]}px`]));
  let crop = null;
  if (doc) {
    const [w, h] = viewBox(doc.svg), [cx, cy, cw, ch] = C.crop ?? [0, 0, w, h], kk = S.crop / cw;
    crop = (
      <div className="crop" style={{ width: S.crop, height: Math.round(ch * kk) }}>
        <div style={{ position: "absolute", width: w, height: h, transformOrigin: "0 0", transform: `scale(${+kk.toFixed(4)})`,
          left: Math.round(-cx * kk), top: Math.round(-cy * kk) }}>
          <Diagram doc={doc} t={C.still ?? 0} hide={C.hide ?? LEGEND} />
        </div>
      </div>
    );
  }
  const side = S.mode === "side";
  return (
    <AbsoluteFill>
      <style>{css.cover ?? ""}{Object.entries(R.colors ?? {}).map(([key, v]) => `:root{--${key}:${v}}`).join("")}</style>
      <div id="stage" className={side ? "side" : undefined} style={{ width: S.W, height: S.H, ...vars }}>
        <div id="band" style={{ top: S.band[0], height: S.band[1] - S.band[0] }}>
          <div id="col" ref={col} style={k < 1 ? { transform: `scale(${k})` } : undefined}>
            <div className="text">
              {C.logo && <img className="logo" src={assets[C.logo]} alt="" />}
              {C.chip && <div className="chip">{C.chip}</div>}
              {C.headline && <h1 dangerouslySetInnerHTML={{ __html: C.headline }} />}
              {side && C.foot && <div className="foot">{C.foot}</div>}
            </div>
            {crop}
            {!side && C.foot && <div className="foot">{C.foot}</div>}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

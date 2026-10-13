// Remotion slide deck: the Reel composition in a <Player>, one slide per scene (slide overrides applied), steps as
// frames where playback holds, same keys as the built-in slides.html. Data: ./props.json (written by the renderer).
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { Reel } from "../src/Reel.jsx";
import { LAYOUTS, slideOf, timeline } from "../../core.mjs";

const props = await (await fetch("./props.json")).json();
props.R = { ...props.R, scenes: props.R.scenes.map(slideOf) };
const { W, H } = LAYOUTS[props.size], fps = props.fps ?? 30;
const { scenes, total } = timeline(props.R);
const F = t => Math.round(t * fps);
const steps = s => (s.diagram ? s.steps ?? [] : []);
const stepFrame = (s, t) => Math.min(F(s.end) - 1, F(s.start + t - (s.offset ?? 0)));
const loopRange = s => [F(s.start + Math.min(2.5, (s.end - s.start) / 2)), F(s.end - .4)];   // settled part, before the fade
const notes = new BroadcastChannel("slides-notes");

function Deck() {
  const player = useRef(), target = useRef(null), iRef = useRef(0);
  const [i, setI] = useState(() => Math.min(scenes.length - 1, Math.max(0, (parseInt(location.hash.slice(1)) || 1) - 1)));
  const [k, setK] = useState(0), [help, setHelp] = useState(false), [paused, setPaused] = useState(false);
  const [box, setBox] = useState({ w: innerWidth, h: innerHeight });
  const s = scenes[i], st = steps(s);
  iRef.current = i;

  const hold = f => { target.current = null; player.current.pause(); player.current.seekTo(f); };
  const enter = useCallback((n, step = 0) => {
    const x = scenes[n], xs = steps(x);
    setI(n); setK(step);
    history.replaceState(null, "", `#${n + 1}`);
    if (step && step < xs.length) return hold(stepFrame(x, xs[step]));
    target.current = xs.length ? stepFrame(x, xs[0]) : null;
    player.current.seekTo(F(x.start));
    player.current.play();
  }, []);

  useEffect(() => {          // hold at pause points; loop the settled part of the slide after its last step
    const p = player.current;
    const on = ({ detail: { frame } }) => {
      const x = scenes[iRef.current], [a, b] = loopRange(x);
      if (target.current !== null && frame >= target.current) return hold(target.current);
      if (target.current === null && frame >= b && p.isPlaying()) p.seekTo(a);
    };
    p.addEventListener("frameupdate", on);
    return () => p.removeEventListener("frameupdate", on);
  }, []);

  const next = () => {
    if (target.current !== null) { const f = target.current; hold(f); return; }          // still moving: finish this step
    if (k < st.length) { const nk = k + 1; setK(nk); target.current = nk < st.length ? stepFrame(s, st[nk]) : null; player.current.play(); return; }
    if (i < scenes.length - 1) enter(i + 1);
  };
  const prev = () => {
    if (k > 0) { const nk = k - 1; setK(nk); hold(stepFrame(s, st[nk])); return; }
    if (i > 0) enter(i - 1, Math.max(0, steps(scenes[i - 1]).length - 1));
  };

  useEffect(() => {
    const onKey = e => {
      const key = e.key;
      if (["ArrowRight", " ", "PageDown", "Enter"].includes(key)) next();
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(key)) prev();
      else if (key === "Home") enter(0);
      else if (key === "End") enter(scenes.length - 1);
      else if (/^[1-9]$/.test(key) && +key <= scenes.length) enter(+key - 1);
      else if (key === "f" || key === "F") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      else if (key === "s" || key === "S") openNotes();
      else if (key === "p" || key === "P") { const p = player.current; p.isPlaying() ? p.pause() : p.play(); setPaused(!p.isPlaying()); }
      else if (key === "r" || key === "R") enter(i);
      else if (key === "?") setHelp(h => !h);
      else if (key === "Escape") setHelp(false);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    const onResize = () => setBox({ w: innerWidth, h: innerHeight });
    addEventListener("resize", onResize);
    return () => { removeEventListener("keydown", onKey); removeEventListener("resize", onResize); };
  });
  useEffect(() => { enter(i); }, []);       // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { notes.postMessage({ i, k, title: s.title ?? (s.type === "outro" ? "Outro" : ""), notes: s.notes ?? "", next: scenes[i + 1]?.title ?? "" }); });
  window.deck = { next, prev, enter, state: () => ({ i, k, steps: st.length, frame: player.current?.getCurrentFrame(), target: target.current }) };

  const z = Math.min(box.w / W, box.h / H);
  return (
    <>
      <Player ref={player} component={Reel} inputProps={props} durationInFrames={Math.max(1, F(total))} fps={fps}
        compositionWidth={W} compositionHeight={H} style={{ width: W * z, height: H * z, margin: "0 auto", top: (box.h - H * z) / 2 }}
        controls={false} clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false} acknowledgeRemotionLicense
        numberOfSharedAudioTags={0} initiallyMuted />   {/* no audio in the deck: lets the first slide play without a click */}
      <div id="hud">{`${i + 1} / ${scenes.length}${st.length ? `  ·  step ${Math.min(k + 1, st.length)} / ${st.length}${k === st.length ? " (looping)" : ""}` : ""}${paused ? "  ·  paused" : ""}`}</div>
      {help && <div id="help"><div>→ / Space / PgDn next step · ← / PgUp previous<br />Home / End · 1–9 jump · F fullscreen · S notes · P pause · R restart · ? help</div></div>}
    </>
  );
}

function openNotes() {
  const w = open("", "slides-notes", "width=560,height=420");
  w.document.write(`<!doctype html><title>Speaker notes</title><body style="font:20px/1.5 system-ui;background:#0d1117;color:#e6edf3;padding:24px">
    <div id=h style="color:#9198a1;font:600 14px ui-monospace,monospace"></div><h2 id=t></h2><p id=n></p><div id=x style="color:#9198a1"></div>
    <script>new BroadcastChannel("slides-notes").onmessage=e=>{const d=e.data;h.textContent="slide "+(d.i+1)+(d.k?" · step "+d.k:"");t.textContent=d.title;n.textContent=d.notes;x.textContent=d.next?"next: "+d.next:""}<\/script>`);
  w.document.close();
}

createRoot(document.getElementById("root")).render(<Deck />);

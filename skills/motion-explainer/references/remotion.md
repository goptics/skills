# Remotion renderer

Load in phase 4 when the user picks Remotion. It renders the same `scenes.json`, diagrams and voice-over as the built-in engine, with every motion driven by Remotion's frame clock.

## Before installing: licence

Remotion is free for individuals, organisations of up to 3 people, non-profits, and for evaluation. Companies of 4 or more need a **Remotion Company License** (remotion.dev/docs/license). Ask who the video is for. If the answer is a company of 4+, say so and let the user decide; if unclear, use the built-in engine.

## When it is worth it

- Faster renders: frames render in parallel (a 60 s reel in ~3 min instead of ~6 on a 24-core machine).
- Remotion Studio: scrub the timeline and inspect any frame (`node render.mjs --renderer remotion --serve`). The Studio preview is silent; voice is mixed in at render.
- `focus` camera moves: zoom into one region of a diagram for a time window (below).
- A Player-based slide deck (`slides.md`).
- The project already uses Remotion.

## Setup

```bash
cp -r "$SKILL/reel/remotion" assets/explainers/reel/
(cd assets/explainers/reel/remotion && npm install)     # ~250 packages, about a minute
cd assets/explainers/reel && node render.mjs --renderer remotion
```

Set `"renderer": "remotion"` in `scenes.json` to make it the default. The system Chrome is used when found ($CHROME, /usr/bin/google-chrome, macOS Chrome); otherwise Remotion downloads its own headless browser.

Versions are pinned (Remotion 4.0.529, React 19.3.0, Vite 8.3.1). Harmless noise: npm may skip esbuild's postinstall script, and the deck build warns about "use client" and chunk sizes. For upgrades and general Remotion work, Remotion's own agent skills help: `npx skills add remotion-dev/skills`.

## How diagrams stay true

Remotion can't play the SVGs' CSS animations: it renders frames independently. So each diagram's `<name>-<slug>.motion.json` (written by `kfu.render`, or `python3 gen/kfu.py --motion x.svg`) is replayed per frame with the same keyframes and easing, and drawn from the static SVG. The renderer makes a missing motion file itself when `gen/kfu.py` is there.

- Never write CSS animations, `@keyframes` or Web Animations into Remotion components: they won't follow the frame clock. Derive everything from `useCurrentFrame()`.
- Never hand-edit `motion.json`; rebuild the SVG.

Parity with the built-in engine (varmq reel): same layout to the pixel, diagrams at the same state per frame, 41 dB PSNR (text antialiasing differs between the two Chrome modes).

## Remotion-only: `focus`

```json
{ "title": "Concurrency", "diagram": "../x-pool.svg", "focus": { "at": [5, 10], "box": [300, 180, 440, 160] } }
```

`at`: scene seconds; `box`: diagram units (`x, y, w, h` in the SVG's viewBox). The camera eases in over 0.6 s, holds, and eases back out by `at[1]`. Keep the box's aspect close to the diagram's, and check with stills (`--at`). The built-in engine ignores `focus`.

## Files

```
reel/remotion/
  package.json  vite.config.mjs
  src/index.jsx  Root.jsx  Reel.jsx  Diagram.jsx  Cover.jsx     compositions "Reel" and "Cover"
  deck/index.html  main.jsx                                     Player slide deck (Vite)
```

Props are built by `renderers/remotion.mjs` at render time (scenes, motion data, images as data URIs, the shared CSS); nothing in `src/` is project-specific.

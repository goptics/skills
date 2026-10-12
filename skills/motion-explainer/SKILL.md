---
name: motion-explainer
description: >
  Turn a library, codebase, article, or concept into truthful animated SVG
  diagrams (one per concept, README-ready, light/dark, reduced-motion safe) and
  a short explainer video stitched from them. Use when the user asks to
  animate how something works, make animated README diagrams, explain a
  library or algorithm visually, or make a reel, short, or explainer video
  about code or an idea, or runs /motion-explainer.
user-invocable: true
compatibility: Requires a shell with python3 (SVGs), plus node 18+, ffmpeg, and Google Chrome or Chromium for the video and cover. SVGs still work without the video tools.
metadata:
  version: v0.1.0
---

# motion-explainer

Content in, two outputs:

1. **One animated SVG per concept.** CSS `@keyframes`, seamless loop, light/dark, reduced-motion still frame. Renders in a GitHub README.
2. **A short video** (MP4 + SRT captions + cover PNG + voice-over script), built from those SVGs.

The engine is in this skill. The choreography of each concept is written by you, per content. That part is where the quality comes from.

`$SKILL` below = the folder holding this `SKILL.md`. Run scripts through their interpreter (`python3 $SKILL/scripts/x.py`), never by bare path.

## Iron rule: truth first

An animation that looks right but behaves wrong is worse than none. Every moving part must match the real behaviour of the thing explained.

- Each concept starts from **facts with citations** (`path/file.go:123` or a quoted sentence). These become the storyboard's **invariants**.
- Stateful behaviour (queues, schedulers, caches, retries) is **simulated** in the generator, never hand-timed. `assert`s tie the timeline to the invariants.
- Unsure how it behaves? Read the source again or ask the user. Never guess and animate the guess.

Past mistakes this rule caught (check for their equivalents):

| Looked plausible | Real behaviour |
|---|---|
| Queue pre-filled at loop start | Queue starts empty; jobs dispatch as soon as they arrive |
| One wake-up signal drawn per job | Signal channel holds one pending signal; extras coalesce or drop |
| Fixed pool of N workers always visible | Workers spawn on demand up to the limit and retire when idle |
| Next free worker picked round-robin | Idle workers are reused LIFO |

## Output layout (in the target project)

Default root `assets/explainers/`. Use another folder only if the user asks.

```
assets/explainers/
  STORYBOARD.md              concepts, facts, invariants, timelines
  gen/                       engine copy + one generator per concept
    kfu.py  frames.py  base.tpl.svg
    gen_<slug>.py  <slug>.tpl.svg
  <name>-<slug>.svg          generated; never hand-edit
  reel/                      video engine copy + data
    index.html  cover.html  render.mjs  package.json
    scenes.json  SCRIPT.md
    reel.mp4  reel.srt  cover.png   (generated)
```

The engine is **copied** into the project, not imported, so the outputs rebuild later without this skill.

## Phase 0: Preflight

```bash
python3 --version
node --version          # 18+, video only
ffmpeg -version | head -n 1
command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser
```

macOS Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Windows: `where chrome`.

Missing `python3` → stop and tell the user. Missing node, ffmpeg or Chrome → say the video phase is unavailable, give the install hint for their OS, and continue with SVGs. Chrome is also needed for frame checks in phase 3; without it, ask the user to open the SVGs and report what they see.

## Phase 1: Understand

- **In:** the content (repo, files, URL, pasted text) and the user's goal (README, talk, social post).
- **Do:** read it. Cut it into **3-6 concepts** that build on each other, basic to advanced. One concept = one idea a viewer can watch in 10-15 s. For each: one-line claim, the facts with citations, what moves.
- **Out:** the concept list in `assets/explainers/STORYBOARD.md`.
- **Reference:** `references/storyboard.md` (concept extraction).

**Checkpoint 1.** Show the concept list and its facts. Wait for the user's OK or corrections.

## Phase 2: Storyboard

- **In:** approved concepts.
- **Do:** per concept, fill in the storyboard template: actors, states, timeline in seconds, cited invariants, loop length, the still-frame moment for reduced motion, and the loop-seam check (end state == start state).
- **Out:** `STORYBOARD.md` complete.
- **Reference:** `references/storyboard.md` (template + worked example).

**Checkpoint 2.** Show the storyboard. Wait for the OK. Fixing a wrong invariant here costs minutes; fixing it after rendering costs hours.

## Phase 3: Build the SVGs

- **In:** approved storyboard.
- **Do:**
  1. Copy the engine: `mkdir -p assets/explainers/gen && cp $SKILL/scripts/kfu.py $SKILL/scripts/frames.py $SKILL/assets/base.tpl.svg assets/explainers/gen/`.
  2. Per concept write `<slug>.tpl.svg` (static layout, from `base.tpl.svg`) and `gen_<slug>.py`: simulation → `kfu.kf()` keyframes, invariants as `assert`s, then `kfu.render("<slug>.tpl.svg", "../<name>-<slug>.svg", still=<t>)`. Set the shared legend once with `kfu.LEGEND = kfu.legend([...])`. Worker/connection pools: `kfu.Pool` (spawn on demand, LIFO reuse, retire). Event order: `heapq`.
  3. Build: `cd assets/explainers/gen && for g in gen_*.py; do python3 "$g" || exit 1; done`.
  4. **Look at the frames.** `python3 frames.py ../<name>-<slug>.svg` writes paused-frame contact sheets (light and dark, plus a seam frame to compare with t=0) and prints their paths; `--at 2,5.5` for chosen moments. Open the PNGs and check each frame against the timeline and the invariants. A green build proves nothing about what the viewer sees.
- **Out:** `assets/explainers/<name>-<slug>.svg` per concept, plus contact sheets.
- **Reference:** `references/svg-rules.md` (rendering rules, layout, contrast, legend).

**Checkpoint 3.** Show the SVGs and contact sheets. Wait for the OK before any video work.

## Phase 4: Video

Ask first (unless already answered):

- Video wanted at all, or SVGs only?
- **Aspect ratio**: 9:16 (Reels, Shorts, TikTok), 16:9 (YouTube, talks), or 1:1 (feeds). One or several; all come from the same `scenes.json`.

Then:

- **In:** approved SVGs, chosen ratio(s).
- **Do:**
  1. Copy the engine: `mkdir -p assets/explainers/reel && cp $SKILL/reel/* assets/explainers/reel/ && (cd assets/explainers/reel && npm install)`.
  2. Write `scenes.json`: one scene per concept (title, code or points, diagram, loop `offset`, caption). First scene visible at frame 0, no intro card.
  3. Write `SCRIPT.md`: voice-over per scene, ~2.5 words/s.
  4. Check stills at each scene midpoint: `node render.mjs --at <t1>,<t2>,...`. Look at them: safe zones, text size, diagram aligned with the code panel margins.
  5. Render: `node render.mjs` (MP4 + SRT), then `node render.mjs --cover`.
- **Out:** `reel.mp4`, `reel.srt`, `cover.png`, `SCRIPT.md`.
- **Reference:** `references/reel.md` (safe zones, pacing, offsets, cover, script format).

## Phase 5: Package

- Add rebuild commands where the project keeps them (Makefile target, npm script, or a short `assets/explainers/README.md`).
- Give the user the README embed per SVG: `![<concept>](assets/explainers/<name>-<slug>.svg)`.
- List every output path. Say which checks you ran by looking (contact sheets, stills) and which you did not.

## Common mistakes

| Mistake | Fix |
|---|---|
| Animating from memory of the API | Cite source lines; simulate; assert |
| Hand-editing a generated SVG | Edit the template or generator, rebuild |
| Loop jumps at the seam | End state must equal start state; check frames at 0 and D |
| JavaScript, SMIL, or `offset-path` in the SVG | GitHub's `<img>` ignores them; CSS `@keyframes` only |
| Only checking the dark theme | Contact sheet in both themes; text keeps 4.5:1 contrast |
| Text under the platform UI in the video | Keep inside the safe zone from `references/reel.md` |
| Video starts on a title card | First concept visible at frame 0 |
| Skipping a checkpoint because "it's obvious" | Checkpoints are where truth gets fixed; never skip |

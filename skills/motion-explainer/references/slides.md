# Slides

Load in phase 4 when the user wants a deck to present (talk, class, demo). Same scenes, same diagrams, driven by the keyboard instead of a clock.

## What the deck is

- One slide per scene in `scenes.json`, in order, including the outro. Default size 16:9 (`"slides": { "size": "16:9" }` at the top level, or `--size`).
- Diagrams play live. A scene's `steps` are pause points: diagram-loop seconds (the same times as the storyboard timeline and `frames.py --at`) where the animation holds until the presenter presses →. After the last pause point the diagram loops on; the next → goes to the next slide. Without `steps` the diagram just loops.
- Speaker notes are the scene's `say` unless the slide says otherwise.

## Custom slide version: `slide` overrides

The deck can differ from the video without a second file. Anything in a scene's `slide` replaces that field for the slide only:

```json
{ "duration": 15, "title": "Concurrency", "code": "…", "diagram": "../x-pool.svg", "caption": "Concurrency is a limit.",
  "say": "Pass a concurrency, say four. …",
  "steps": [1.6, 3.4, 5.4],
  "slide": { "title": "Concurrency is a limit, not a pool size", "caption": "Workers spawn on demand, retire when idle.",
             "notes": "Pause on 'all 4 busy'. Ask: what happens to job 5?" } }
```

Use it for longer titles or captions than a reel allows, extra `points`, or notes that are cues for the presenter rather than a script.

## Keys

| Key | Does |
|---|---|
| → Space PgDn Enter | next pause point; finishes a move at once if the diagram is still moving; then next slide |
| ← PgUp Backspace | previous pause point, then previous slide (arriving on its last pause point) |
| Home / End, 1-9 | first / last slide, jump to slide n |
| F | fullscreen |
| S | speaker-notes window (title, notes, next slide); stays in sync |
| P | pause / play the diagram |
| R | restart the slide |
| ? | key help |

The slide number is in the URL (`#3`), so a reload stays on the slide.

## Run, share

```bash
cd assets/explainers/reel
node render.mjs --slides                      # built-in deck at http://127.0.0.1:8765/…/slides.html
node render.mjs --slides --export ../slides   # static folder: host anywhere (any static server), no Node needed
```

With the Remotion renderer (see `remotion.md`): `node render.mjs --renderer remotion --slides` (http://localhost:8766/) and `--export` builds it with Vite. Same keys, same data.

Both decks need http (a static server), not `file://`, because they load `scenes.json` and modules.

## Choosing pause points

- Pick the moments the storyboard calls out: the state change the slide is about (all slots busy, the reorder, the dropped signal). 2-4 per slide.
- Check each one: `python3 gen/frames.py ../x.svg --at 1.6,3.4,5.4` shows exactly what the audience will see while you talk.

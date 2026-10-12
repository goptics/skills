# Reel

Load in phase 4. Covers `scenes.json`, layout per size, pacing, diagram offsets, the cover and the voice-over script.

## Sizes and safe zones

Ask the user which size(s) before writing `scenes.json`, then list them in `"sizes"`. All come from the same scenes.

| Size | Pixels | For | Keep text out of |
|---|---|---|---|
| `9:16` | 1080×1920 | Reels, Shorts, TikTok | bottom ~350 px (caption, buttons), right ~120 px of the lower half (like/share column), top ~100 px (status bar, app header) |
| `16:9` | 1920×1080 | YouTube, talks, slides | bottom ~60 px (player bar); thumbnails cover the bottom-right corner with the duration |
| `1:1` | 1080×1080 | LinkedIn, X and other feeds | a ~50 px margin all round |

- **9:16 profile grids** crop to the middle 1080×1350 (y 285-1635). Anything that must show on the grid (the cover) stays inside that band.
- The engine already respects these zones: `LAYOUTS` in `index.html` holds them per size, the scene body shrinks to fit above the bottom zone, and 9:16 captions stop 120 px from the right. The code panel and diagram run to 40 px from the right edge: in 9:16, keep essential diagram labels out of the SVG's right-most ~80 units. Your part is to keep the content short enough that it doesn't have to shrink much.

## `scenes.json`

Schema in the comment at the top of `index.html`. A two-scene example:

```json
{
  "title": "VarMQ reel",
  "sizes": ["9:16"],
  "lang": "go",
  "packages": ["varmq", "fmt", "time"],
  "scenes": [
    { "duration": 15, "step": "2 / 4", "title": "Concurrency",
      "code": "worker := varmq.NewWorker(process, ⟦4⟧)\n\nqueue := worker.BindQueue()\nfor i := range 6 {\n    queue.Add(i)\n}",
      "diagram": "../varmq-worker-pool.svg", "offset": 0.5,
      "caption": "Concurrency is a limit: workers spawn on demand and retire when the queue drains." },
    { "duration": 4, "type": "outro", "logo": "../logo-dark.svg", "lang": "sh",
      "code": "go get github.com/goptics/varmq", "lines": ["⭐ github.com/goptics/varmq"] }
  ],
  "cover": { "chip": "basic → advanced", "headline": "Go worker pool<br>in <span>60s</span>",
             "diagram": "../varmq-worker-pool.svg", "still": 5.4, "crop": [130, 8, 795, 390],
             "foot": "github.com/goptics/varmq" }
}
```

- Paths are relative to the `reel/` folder. The server serves `root` (default `..`, the folder with the SVGs). Set `"root": "../.."` when a logo lives higher up.
- `packages`: names coloured as packages when followed by `.` or `::` (`varmq.`, `fmt.`). Leave out local variables.
- `⟦…⟧` marks a highlight that pulses once, 1.6 s into the scene.
- A scene with `points` instead of `code` shows a short list (HTML allowed, `<code>` for identifiers). Use it for non-code ideas, or for a summary scene with no diagram.
- Non-code content can still use the code panel for a short excerpt (an RFC figure, a formula, a config line): set `"lang": "text"` for plain monospace. Any language without a highlighter renders as plain text.
- The outro takes any of `logo`, `code` (with `lang`, default shell: an install command, or an import line for a stdlib module) and `lines` (call to action, link).
- `colors` overrides the CSS variables (`"accent": "#58a6ff"`) to match the project's brand.

## Content per scene

| Part | Budget (9:16) | Why |
|---|---|---|
| Title | 1-3 words | 76 px, one line |
| Code | ≤ 8 lines, ≤ 50 characters per line | 30 px mono on a 1000 px panel; more lines push the diagram into the bottom zone |
| Caption | ≤ 2 lines, ~80 characters | 52 px; it fades in at 1.2 s and is also written to the SRT |
| Highlights | 1-2 per scene | mark what changed since the previous scene (`⟦4⟧`, `⟦RoundRobin⟧`) |

16:9 fits ~46 characters per code line in its left panel and ~120 characters of caption on 2 lines. 1:1 shrinks the body, so keep it to ~6 lines of code and ~70 characters of caption.

- The code is the **minimum that produces the diagram's behaviour**, with real API names from the content. Cut setup lines the viewer doesn't need.
- **Diagram text is small on a phone.** A 960-unit diagram fills ~1000 px of a 1080 video that a phone shows ~390 pt wide, so 11 px labels become unreadable. The caption carries the meaning; the diagram shows the motion. Keep the key labels in the SVG at 13-14 px.
- The diagram is scaled to the code panel's width, so their margins line up. Don't override its position.

## Pacing

- **First scene visible at frame 0.** No intro card, no logo sting. The first frame is what people see while deciding to keep watching, and it is the default thumbnail on some platforms.
- **12-15 s per concept**, a 4 s outro, ~60 s in total. Order the scenes as the storyboard does: basic → advanced. Over 60 s: cut script words first, then drop or merge the weakest concept; up to ~90 s only if the user agrees.
- Voice-over runs at **~2.5 words per second**. A scene's duration ≈ its script words ÷ 2.5 + 1.5 s for the code to type in. Write the script first, then set the durations.
- Each scene fades in and out in 0.35 s. The code lines appear 0.12 s apart from 0.3 s, the diagram at 0.6 s and the caption at 1.2 s, so the first 2 s of every scene are the setup. The first scene skips these entrances: frame 0 shows it complete.

## Diagram `offset`

`offset` = how many seconds into the diagram's loop the scene starts. Scene time `t` shows the diagram at `t - start + offset`.

- Most loops start empty and idle (correctly). Skip the quiet start with an offset of 0.5-1.5 s, so the first event lands right after the diagram fades in (0.6 s into the scene).
- The diagram's key moment (the reorder, all slots busy, the dropped signal) should fall while the caption is up, roughly 2-10 s into the scene.
- If the loop `D` is longer than the scene, the scene shows only part of it. Pick the part that matches the caption, and check that it doesn't cut away mid-event.
- If `D` is shorter than `offset + duration`, the diagram wraps to its start inside the scene, under a caption about the end. Usually wrong: lengthen `D` with a calm tail or shorten the scene. Always check a still ~1 s before each scene ends.
- A negative `offset` holds the diagram's first frame for that many seconds before it starts moving.
- Check with stills at a few times per scene: `node render.mjs --at 2,6,10`.

## Cover

The cover is the thumbnail and the grid tile, so design it to be read at ~270 px wide.

- **Headline**: the promise, ≤ 2 lines, a few words in `<span>` for the accent colour ("Go worker pool in **60s**").
- **Chip**: the angle ("basic → advanced", "under the hood").
- **Diagram**: the busiest, most telling moment, usually the storyboard's still frame (`still`), cropped to its core (`crop: [x, y, w, h]` in diagram units). The legend is hidden automatically. Use `hide` with CSS selectors to remove other clutter.
- **Foot**: where to find it (repo URL, site).
- In 9:16, everything stays inside the 1080×1350 middle band; the engine places it there.
- Render it with `node render.mjs --cover`, then look at it scaled down to thumbnail size.

## Voice-over script (`SCRIPT.md`)

The video is silent. `SCRIPT.md` gives the presenter the words and the times. Times come from the scene durations.

```markdown
# <Name> reel: voice-over script (60s)

Timings match `scenes.json`. About 2.5 words per second keeps the pace natural.

| Time | Scene | Say |
|---|---|---|
| 0:00–0:13 | 1 · Basic usage | "VarMQ, in sixty seconds. Create a worker with your job function and bind a queue. …" |
| 0:13–0:28 | 2 · Concurrency | "Pass a concurrency, say four. That's a limit, not a pool size: …" |
| 0:56–1:00 | Outro | "go get github.com/goptics/varmq, and drop a star if it helps." |

## Make the video

    cd assets/explainers/reel && npm install && node render.mjs

Writes `reel.mp4` (silent) and `reel.srt` (captions). Add a voice or face-cam on top in any editor.
Cover: `node render.mjs --cover`. Live presenter mode to screen-record while talking: `node render.mjs --serve`
(←/→ jumps scenes, space pauses).
```

- The script says the same thing as the caption, in more words. Every fact in it comes from the storyboard; nothing new is claimed only in the voice-over.
- Read it aloud against the live mode (`--serve`) once. If a line doesn't fit its scene, shorten the line or lengthen the scene, then re-render.

## Check before handing over

1. Stills for every size at `t=0`, each scene's midpoint and the outro: `node render.mjs --at 0,6.5,20.5,…`. Look at each one:
   - frame 0 already shows the first scene;
   - no text in the safe zones; nothing cut off; the body isn't shrunk to unreadable;
   - the diagram shows the moment the caption describes.
2. `ffprobe -v error -show_entries stream=width,height,r_frame_rate:format=duration -of csv=p=0 reel.mp4`: expected size, 30 fps, and the summed duration.
3. Captions: `reel.srt` has one cue per captioned scene.
4. Cover checked at thumbnail size.

Rendering takes a few minutes per size (one screenshot per frame). Run it in the background, and render stills while you iterate. Stills (`still-*.png`) land in `reel/`; delete them or keep them gitignored.

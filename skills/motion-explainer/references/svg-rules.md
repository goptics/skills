# SVG rules

Load in phase 3. Each rule exists because breaking it broke a real diagram.

## How a diagram is built

- **Template** `<slug>.tpl.svg` = the static part: layout, boxes, labels, edges, colours. Copy it from `base.tpl.svg`.
- **Generator** `gen_<slug>.py` = the timeline. It simulates the behaviour, calls `kfu.kf(id, points)` once per moving element, then `kfu.render(tpl, out, still=t)`.
- `kfu.render` fills the slots: `{D}` (loop seconds), `{STILL}` (reduced-motion frame), `<!--LEGEND-->` (`kfu.LEGEND` or `legend=`), `<!--ELEMENTS-->` (`kfu.elements`), `/*KEYFRAMES*/`.
- Diagrams that share a layout can share one template: read it, `str.replace()` the differences, and pass the text to `kfu.render` instead of a path. Don't keep a template-generating script outside the project.
- Times are authored in **seconds**. `kfu` converts them to `%` of the loop length `kfu.D`.
- **Keyframe name == element `id`**, and the element needs class `a` (`<circle id="job0" class="a dot" .../>`).
- Never hand-edit the generated SVG. Change the template or the generator and rebuild.

`kfu` helpers:

| Helper | Use |
|---|---|
| `kf(id, [(t, {prop: value})])` | Raw keyframes; pads 0% and 100% with the first and last values |
| `at(t, x, y, opacity, fill=None)` | One point for a moving element |
| `Path(t, x, y, speed).to(x, y, op=).wait(dt)` | Constant-speed walk along straight segments; `op=0` hides the dot (inside a box) |
| `flash(id, spans, peak)` | Glow on/off over `(start, end)` spans; overlapping spans merge |
| `ring(id, times, gap)` | Wake-up pulse; pulses closer than `gap` coalesce |
| `bar(id, spans)` | Progress bar / timer filling over each span; `(s, e, 0.4)` stops at 40% (cancelled); a span starting before the last one faded restarts it |
| `states(prefix, [(t, i)], n)` | Changing text (state names, counters): draw one element per state, ids `prefix0..`, one shown at a time |
| `kfu.elements.append(svg)` | Markup for elements whose count the simulation decides; filled into `<!--ELEMENTS-->` |
| `Pool(limit, idle)` | Workers: `take(t)` (LIFO reuse, else spawn), `release(w, t, keep)`, `rows()` (alive vs ghost slot) |
| `legend([(swatch, colour, label)])` | Legend markup; swatches `box`, `dot`, `bar`, `pip` |

Event order in a simulation: use Python's `heapq` (`heappush(events, (t, kind, ...))`), not hand-sorted lists.

## Rendering: what survives GitHub

GitHub shows README SVGs through `<img>`. That sandbox decides most rules.

- **CSS `@keyframes` only.** No JavaScript (blocked), no SMIL `<animate>` and no `offset-path` (unreliable across browsers).
- Animate **`transform` and `opacity`** (plus `fill` for colour changes). Set `transform-box: fill-box` (in `.a`). Move dots with `translate(...)` from a shape drawn at `0,0`.
- Use the `r` **attribute** on circles, never CSS `r` (Safari ignores it).
- **No external anything.** No web fonts, linked images or stylesheets: `<img>` won't load them. Use the system font stacks in `base.tpl.svg`.
- No `<foreignObject>` (HTML inside SVG): it renders differently or not at all.
- **One loop.** Every element animates over the same `--dur`, `infinite`. Nothing is triggered or delayed per element.
- **Deterministic output.** No randomness (or a fixed seed), stable ordering. The SVG is committed, so `git diff` shows exactly what changed.

## Truth: simulate, then assert

- The timeline comes from a **simulation** of the real rules (who gets the next job, what a full buffer does, when a worker retires). Never hand-place events that the rules would decide.
- Each storyboard invariant becomes an `assert` in the generator:
  - capacity is never exceeded (`curProcessing <= concurrency`);
  - order rules hold (priority, FIFO, round-robin skips empty queues);
  - what is dropped really is dropped (coalesced signals reach nobody);
  - every item that arrives is handled before the loop ends;
  - **end state == start state** (empty queues, the same idle workers). This is the seam.
- Derive `kfu.D` from the simulation (last event + a calm tail of ~1.5 s), and assert that everything fits inside it. `kf()` stores seconds; they become % of the final `kfu.D` only at `render`, so set `D` whenever the simulation knows it.
- When the real implementation can be called (a library function, a data structure), replay the scenario against it in the generator and assert the drawn state equals the real state after every step.
- `if __name__ == "__main__":` print the simulated timeline (dispatch times, who handled what). Read it before you look at pixels.

## Seamless loop

- The last frame must equal the first. Check the `seam` frame of the contact sheet against `t=0`.
- Elements that exist only for part of the loop start and end with `opacity: 0`.
- Things present from the start (an idle worker, a resident cache entry) must be present at the end too, at the same place.
- **Systems that never return to their start state** (a connection that ends CLOSED, a cache that stays warm): end the run, hold the end state ~1 s, then cross-fade to the start state with a small "↻ replay" label. Assert the behaviour within the run as usual; the seam check then only proves the cross-fade, not a fact about the system. Say so in the storyboard.

## Layout

- **Width 960** (`viewBox="0 0 960 H"`, H ≈ 360-440). A README column is ~830-1000 px, and phones show it at ~40%, so keep key labels at 13-14 px and nothing below 11 px.
- Keep a 20 px outer margin. Flow left → right (producer → queue → dispatcher → workers), and signals and feedback loop back along the top.
- **Label every box** with what it is in the content's own words (`processNextJob()`, `Event Loop`), plus a small mono caption with the real identifier.
- Moving dots **hide inside boxes** (`op=0`) while that box does the work, then reappear on the outgoing edge. This reads as "processed here".
- **Show why nothing happens.** When the rules refuse something (all workers busy, queue empty, signal dropped), flash a short red `.why` label at that spot ("all 4 busy", "dropped: 1 signal pending").
- Draw unused capacity as a **ghost** (opacity ~.15): a worker slot within the limit that has no worker yet.
- Edges: orthogonal paths, `class="edge"` with `marker-end="url(#arr)"`; signals dashed, `class="sig"` with `url(#arr-sig)`.

## Colour, contrast, legend

- **One colour per role**, the same across every diagram in the set (e.g. yellow = waiting item, green = moving job, blue = busy worker, pink = signal, purple = coordinator, red = refusal).
- Colours are CSS variables, swapped in `@media (prefers-color-scheme: dark)`. The `base.tpl.svg` palette meets contrast in both themes; extend it there, not with inline hex values.
- Add your own classes **after** the base rules in `<style>`: with equal specificity the later rule wins, so a class placed earlier is silently overridden (e.g. by `.bar`).
- Text keeps **WCAG AA 4.5:1** in both themes, **also while a glow flashes under it**. Keep glow opacity at .3 or below behind text.
- Colours mean the same thing in every diagram of the set. Each diagram's legend lists only the roles it shows: `kfu.LEGEND = kfu.legend([...])` when all diagrams show the same roles, else pass `legend=kfu.legend([...])` per `render`.

Quick contrast check (any two hex colours):

```python
def L(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
ratio = lambda a, b: (max(L(a), L(b)) + .05) / (min(L(a), L(b)) + .05)
assert ratio("#59636e", "#ffffff") >= 4.5
```

## Accessibility

- `<title>`: what the diagram shows, one line. `<desc>`: the whole story in plain sentences, start state to end state. Screen readers and the reduced-motion still depend on it.
- **Reduced motion.** `prefers-reduced-motion` pauses the animation on `still=` seconds. Pick the most informative moment (every slot busy, the reorder visible), not `t=0`, which is usually empty.

## Time that can't be shown at real speed

Real durations (a 4-minute timeout, a 30-day TTL) get compressed. Keep the order of events and the comparisons that matter (A expires before B), and add a small "times not to scale" note under the title.

## Checking

- Build, then `python3 frames.py ../<name>-<slug>.svg` and **open both PNGs**.
- The default 480 px cells show motion, not text. Check 2-3 frames at full size for legibility: `--at 2,6 --width 960 --cols 1`.
- Per frame, compare against the storyboard timeline: right elements visible, right counts (queued items, alive workers), red labels only when the rule refuses.
- Seam frame equals `t=0`. Text readable in both themes, also on glowing boxes.
- For one exact moment: `--at 4.6`. Larger frames: `--width 960 --cols 1`.

## Rebuild command for the project

Add a target so the SVGs rebuild without this skill:

```make
explainers:
	cd assets/explainers/gen && for g in gen_*.py; do python3 "$$g" || exit 1; done
```

If generators take template and output paths as arguments (varmq style), loop over `name:slug` pairs instead.

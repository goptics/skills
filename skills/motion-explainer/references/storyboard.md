# Storyboard

Load in phases 1 and 2. Output: `assets/explainers/STORYBOARD.md`, one section per concept.

## Phase 1: cut the content into concepts

**Read, in this order:** README / intro → the main usage example → the code path that example runs (or the article's core section) → tests (they state the edge cases as facts).

**Pick 3-6 concepts.**
- One concept = one question a viewer can answer after watching it for 10-15 s ("what happens when I call `Add` six times?").
- Order basic → advanced. Each concept reuses the previous one's picture and adds **one** new thing (a second worker, a priority, a second queue). Viewers learn the visual vocabulary once.
- Prefer behaviour that surprises or that people get wrong: limits that are not pool sizes, signals that coalesce, reuse order, what happens when full. That is where an animation beats prose.
- Skip what doesn't move (option lists, config tables, type signatures). Mention it in the video as a `points` scene if it matters.

**Write facts, not impressions.** Every fact carries a citation:
- code: `path/file.go:123` (open the file and check the line; don't cite from memory);
- docs, articles, specs: a short quote plus where it is (`README.md "Priority Queue"`, `RFC 9293 §3.5`).

Mark anything you inferred rather than read as **(inferred)**. At checkpoint 1, ask the user to confirm or correct every inferred fact before anything is drawn.

Phase 1 output, per concept:

```markdown
## 2. Concurrency is a limit, not a pool size
Question: what happens when six jobs arrive at once with concurrency 4?
Facts:
- Signal channel has capacity 1. `worker.go:15` (`eventLoopSignalCap = 1`)
- A send to a full channel is dropped. `worker_eventloop.go:120-125` (`select { case ch <- …: default: }`)
- …
Moves: queue fills, 4 workers become busy, 2 jobs wait, workers retire as it drains.
```

## Phase 2: one storyboard per concept

Fill in every field. An empty field is a question for the user, not a default.

```markdown
## <n>. <title>  (`<name>-<slug>.svg`)
Question: <the one question this answers>
Actors: <boxes and moving things, with their on-screen labels>
States: <what each actor can be: empty / queued / busy / idle / ghost …>
Start state: <exact; this is also the end state>
Timeline (seconds):
  0.2  <event>
  …
Loop: D = <seconds, or "derived: last event + 1.5">
Invariants (each becomes an assert):
  - <rule> — <citation>
Why-labels: <refusals to show in red, e.g. "all 4 busy">
Still frame (reduced motion): t = <seconds> — <why this moment>
Seam check: <what must match at t=0 and t=D>
Builds on: <previous concept, and the one new thing>
```

Rules:
- The **timeline** lists events, not pixels. For simulated concepts, write the inputs (arrival times, work durations) and let the generator compute the rest; note "simulated" next to the times.
- **Invariants** are behaviour rules with citations, not layout notes. Aim for 3-6 per concept.
- The **start state** is the honest idle state of the real system (usually empty). Never pre-fill it to make frame 0 look busy.
- The **still frame** is the moment that explains the most at a glance.

## Worked example: varmq (Go job queue)

Four diagrams, each built from the previous one. Facts are from the varmq source.

### Shared facts

| Fact | Citation |
|---|---|
| Every `Add` enqueues, then signals the event loop | `queue.go:52-59` |
| Signal channel capacity is 1 | `worker.go:15` |
| A signal sent while one is pending is dropped | `worker_eventloop.go:120-125` |
| One signal makes the loop dispatch until slots are full or queues are empty | `worker_eventloop.go:22-31` |
| A job goes to the last idle worker, else a new worker is spawned | `worker_eventloop.go:111-118` |
| Idle workers are pushed to and popped from the list's tail (LIFO) | `internal/linkedlist/linkedlist.go:145`, `:179` |
| A finished worker stays idle if queued jobs ≥ concurrency, idle expiry is on, or idle count < minimum (≥1); otherwise it stops | `worker_pool.go:119-133` |
| A finished job frees its slot and signals the loop | `worker_pool.go:112-113`, `worker_eventloop.go:101-108` |
| Lower priority number = served first; ties by insertion order | `internal/queues/heap.go:13-19`, `README.md` "Priority Queue" |
| RoundRobin takes turns and skips empty queues | `internal/helpers/manager.go:172-194` |

### 1. Basic usage (`varmq-single-worker.svg`)

```markdown
Question: what happens to a job after Add?
Actors: Add(job) producer, Queue, Event Loop, "queue not empty && slot free" check, processNextJob, Worker 1
States: queue empty/holding; worker idle/busy
Start state: queue empty, Worker 1 idle
Timeline: 0.2 Add A → signal → dispatch → Worker 1 busy 3.8-6.2; 4.2 Add B while busy → B waits;
  6.2 A done → signal → B dispatched, busy 9.8-12.2; 12.2 B done → signal → queue empty, loop waits
Loop: D = 16
Invariants:
  - queue starts and ends empty — dispatch is immediate on signal (worker_eventloop.go:22-31)
  - B waits only because the one slot is busy (worker_eventloop.go:23)
  - every done sends a signal (worker_eventloop.go:101-108)
Why-labels: "slot busy", "queue empty"
Still frame: t = 5.9 — A busy, B waiting
Seam check: queue empty, Worker 1 idle, no dots visible
Builds on: —
```

### 2. Concurrency (`varmq-worker-pool.svg`)

```markdown
Question: what does concurrency 4 mean when six jobs arrive at once?
Actors: as 1, plus Worker 1-4 rows (ghost when not alive)
Start state: queue empty, pool = [Worker 1] idle, Workers 2-4 ghost slots
Timeline (simulated): Add ×6 at 0.2-0.95; first signal wakes the loop, 5 dropped;
  4 dispatches back to back; 2 jobs wait; done times drive the rest
Loop: D = 16
Invariants:
  - only the first of 6 signals arrives; 5 are drawn as dropped (worker.go:15, worker_eventloop.go:120-125)
  - one wake fills all 4 slots (worker_eventloop.go:23)
  - Workers 2-4 spawn at dispatch time, not before (worker_eventloop.go:117)
  - the next job goes to the most recently idle worker (linkedlist.go:145, :179)
  - a finished worker stops when another is already idle (worker_pool.go:126-132)
  - end: pool = [Worker 1], Workers 2-4 retired
Why-labels: "dropped: 1 signal pending", "all 4 busy", "queue empty"
Still frame: t = 5.4 — all 4 busy, 2 waiting
Seam check: pool back to [Worker 1], ghosts at 2-4, queue empty
Builds on: 1, adds the concurrency limit
```

Generator shape (`gen_pool.py`'s pool logic, written with `kfu.Pool`; `queued(t)` counts jobs still waiting at t):

```python
pool = kfu.Pool(4, idle=1)
events = [(t, "disp", k) for k, t in enumerate(disp)] + [(t, "done", k) for k, t in DONE.items()]
for t, kind, k in sorted(events):
    if kind == "disp":
        worker[k] = pool.take(t)                         # LIFO reuse, else spawn
    else:
        keep = queued(t) >= 4 or not pool.idle          # worker_pool.go:126
        pool.release(worker[k], t, keep)
assert pool.idle == [0] and all(e for w in (1, 2, 3) for _, e in pool.alive[w])   # seam
pool.rows()
```

### 3. Priority queue (`varmq-priority-queue.svg`)

```markdown
Question: who goes next when jobs have priorities?
Start state: queue empty, Worker 1 idle
Timeline: 0.2 Add A → dispatched at once; 2.8 Add B (p=1), 3.3 Add C (p=0) while A runs;
  4.0 heap reorders: C passes B; A done → C; C done → B
Loop: D = 19.2
Invariants:
  - C's signal is dropped: B's is still pending (worker_eventloop.go:120-125)
  - lower number first: C (0) before B (1) (heap.go:13-19)
  - C overtakes B inside the queue while Worker 1 is still busy with A (heap.go:14-19, concurrency 1)
Why-labels: "dropped: 1 signal pending", "slot busy", "queue empty"
Still frame: t = 4.9 — C ahead of B, slot busy
Seam check: queue empty, Worker 1 idle
Builds on: 1, adds ordering
```

### 4. Multiple queues (`varmq-multi-queue.svg`)

```markdown
Question: how does one worker serve several queues?
Actors: Q1-Q3, Queue Manager (RoundRobin), event loop, processNextJob, Worker 1-2
Start state: 3 empty queues, pool = [Worker 1], Worker 2 ghost
Timeline (simulated with heapq): arrivals Q1 ×3, Q2 ×1, Q3 ×2; signals coalesce;
  RoundRobin picks Q1, Q2, Q3, Q1, (Q2 empty → skip) Q3, Q1; workers alternate W1, W2
Loop: D = derived: round(last pulse + 1.6) = 19.2
Invariants:
  - RoundRobin takes turns and skips empty queues (manager.go:172-194)
  - at most 2 jobs processing (worker_eventloop.go:23)
  - Worker 2 spawns on demand and retires; Worker 1 stays (worker_pool.go:126-132)
  - every arrival is dispatched before D; pool ends as [Worker 1]
Why-labels: "all 2 busy", "queues empty"
Still frame: t = 4.6
Seam check: queues empty, pool = [Worker 1]
Builds on: 2, adds several queues and a strategy
```

### Corrections the invariants caught

The first drafts of these diagrams looked right and were wrong. Each fix became an invariant above:

| First draft | Fix | Invariant |
|---|---|---|
| Queues pre-filled at t=0 to look busy | Start empty; jobs dispatch on arrival | start state = honest idle state |
| One signal dot per `Add` reaching the loop | Extra signals drop at the full channel | channel capacity 1 |
| Four workers drawn from the start | Ghost slots; workers spawn at dispatch and retire | spawn on demand / retire |
| Next job to the "next" worker in order | Most recently idle worker first | LIFO pool |

When an animation is corrected, add the missing fact to the storyboard first, then fix the generator, then re-check the frames.

## Content that is not code

The same storyboard works for protocols, algorithms, papers and processes (a TCP handshake, Raft election, a supply chain).
- Facts cite the spec, paper or article (section plus a short quote).
- Simulate whenever there is state: timers, retries, queues, votes. Assert the rules from the source.
- Pure concepts with no state (a definition, a comparison) usually don't need motion. Use a `points` scene in the video instead of forcing a diagram.

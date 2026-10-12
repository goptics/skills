"""Keyframe helpers: author in seconds, emit % of loop D. Keyframe name == element id.

Copy next to your generators. Python 3 stdlib only. Run `python3 kfu.py` for the self-check.
Event queues for simulations: use `heapq` directly (see the worked example in references/storyboard.md).
"""

D = 16.0
rules = []  # (id, [(t seconds, {prop: value})]); turned into % of D at render time, so D may be set last
LEGEND = ""  # filled into <!--LEGEND-->; set once, e.g. kfu.LEGEND = kfu.legend([...])
elements = []  # extra SVG markup filled into <!--ELEMENTS-->, for elements whose count the simulation decides


def pct(t):
    return f"{t / D * 100:.2f}".rstrip("0").rstrip(".") + "%"


def kf(name, pts):
    """Keyframes for element #name, in seconds. Converted with the final kfu.D when rendered."""
    rules.append((name, sorted(pts, key=lambda p: p[0])))


def css(name, pts):
    """@keyframes text for one rule: pads 0% and 100% with the first and last values."""
    if pts[0][0] > 0:
        pts = [(0, pts[0][1])] + pts
    if pts[-1][0] < D:
        pts = pts + [(D, pts[-1][1])]
    assert pts[-1][0] <= D, f"{name}: keyframe at {pts[-1][0]}s is past the loop end D={D}s"
    body = " ".join(f"{pct(t)} {{ " + " ".join(f"{k}: {v};" for k, v in p.items()) + " }" for t, p in pts)
    return f"    @keyframes {name} {{ {body} }}"


def merge(spans, pad=0):
    """Merge (start, end) spans that overlap or sit within pad of each other."""
    out = []
    for s, e in sorted(spans):
        if out and s <= out[-1][1] + pad:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def flash(name, spans, peak, rise=.12, fall=.25):
    pts = [(0, {"opacity": 0})]
    for s, e in merge(spans, rise + fall):
        pts += [(s, {"opacity": 0}), (s + rise, {"opacity": peak}), (e, {"opacity": peak}), (e + fall, {"opacity": 0})]
    kf(name, pts)


def tr(x, y):
    return f"translate({x:g}px, {y:g}px)"


def at(t, x, y, op, fill=None):
    p = {"opacity": op, "transform": tr(x, y)}
    if fill:
        p["fill"] = fill
    return (round(t, 3), p)


class Path:
    """Constant-speed walk along straight segments; op= sets visibility from that point on."""

    def __init__(self, t, x, y, speed, fill=None):
        self.t, self.x, self.y, self.v = t, x, y, speed
        self.pts = [at(t, x, y, 0, fill)]
        self.op = 0

    def to(self, x, y, op=None, fill=None):
        self.t += (abs(x - self.x) + abs(y - self.y)) / self.v
        self.x, self.y = x, y
        if op is not None:
            self.op = op
        self.pts.append(at(self.t, x, y, self.op, fill))
        return self

    def wait(self, dt, op=None, fill=None):
        self.t += dt
        if op is not None:
            self.op = op
        self.pts.append(at(self.t, self.x, self.y, self.op, fill))
        return self


def ring(name, times, gap=.6):
    """Wake-up pulses; pulses closer than gap coalesce (like a 1-slot signal channel)."""
    pts, last = [(0, {"opacity": 0, "transform": "scale(1)"})], -9
    for t in sorted(times):
        if t < last + gap:
            continue
        last = t
        pts += [(t, {"opacity": 0, "transform": "scale(1)"}), (t + .1, {"opacity": .9, "transform": "scale(1.04)"}),
                (t + .6, {"opacity": 0, "transform": "scale(1.18)"})]
    kf(name, pts)


def bar(name, spans):
    """Progress bar / timer that fills over each (start, end) span, then fades and resets.

    A span may be (start, end, fill): stops at that fraction (a timer cancelled early). A span that starts
    before the previous one has faded restarts the bar from 0 right away (a timer restarted)."""
    pts = [(0, {"opacity": 1, "transform": "scaleX(0)"})]
    spans = [(sp[0], sp[1], sp[2] if len(sp) > 2 else 1) for sp in sorted(spans)]
    for i, (s, e, f) in enumerate(spans):
        nxt = spans[i + 1][0] if i + 1 < len(spans) else None
        pts += [(s, {"opacity": 1, "transform": "scaleX(0)"}), (e, {"opacity": 1, "transform": f"scaleX({f:g})"})]
        if nxt is None or nxt >= e + .31:
            pts += [(e + .3, {"opacity": 0, "transform": f"scaleX({f:g})"}), (e + .31, {"opacity": 1, "transform": "scaleX(0)"})]
        else:
            assert nxt >= e, (name, "spans overlap", e, nxt)
            spans[i + 1] = (max(nxt, e + .01), *spans[i + 1][1:])   # instant reset, then refill
    kf(name, pts)


def states(prefix, changes, n, fade=.08):
    """Text or shapes that change with state. SVG text can't change via CSS, so draw one element per state
    (ids prefix0 .. prefix{n-1}, all class="a") and show one at a time. changes: [(t, state index)], from t=0."""
    changes = sorted(changes)
    assert changes and changes[0][0] == 0, (prefix, "state at t=0 is required")
    for k in range(n):
        pts, cur = [], None
        for t, i in changes:
            on = 1 if i == k else 0
            if cur is None:
                pts.append((0, {"opacity": on}))
            elif on != cur:
                pts += [(t, {"opacity": cur}), (t + fade, {"opacity": on})]
            cur = on
        kf(f"{prefix}{k}", pts)


class Pool:
    """Workers spawned on demand up to limit, idle ones reused LIFO (PushBack / PopBack), retired when told.

    alive[w] = [(start, end or None)] lifetimes; rows() draws them as solid (alive) or ghost (free slot).
    """

    def __init__(self, limit, idle=1):
        self.limit, self.idle = limit, list(range(idle))
        self.alive = {w: [(0, None)] if w < idle else [] for w in range(limit)}

    def take(self, t):
        """Worker for a job dispatched at t: the last idle one, else spawn into a free slot."""
        if self.idle:
            return self.idle.pop()
        w = next((w for w in range(self.limit) if not self.alive[w] or self.alive[w][-1][1] is not None), None)
        assert w is not None, f"take at {t}: all {self.limit} workers busy; the caller must wait for a free slot"
        self.alive[w].append((t, None))
        return w

    def release(self, w, t, keep, exit_in=.35):
        """Job done at t: keep the worker idle in the pool, or retire it (gone at t + exit_in)."""
        if keep:
            self.idle.append(w)
        else:
            self.alive[w][-1] = (self.alive[w][-1][0], t + exit_in)

    def rows(self, name="w{}-row", ghost=.15):
        """Opacity keyframes per worker row: 1 while alive, ghost while only a free slot. name gets w + 1."""
        for w in range(self.limit):
            pts = [(0, {"opacity": 1 if self.alive[w] and self.alive[w][0][0] == 0 else ghost})]
            for s, e in self.alive[w]:
                if s > 0:
                    pts += [(s - .1, {"opacity": ghost}), (s + .2, {"opacity": 1})]
                if e:
                    pts += [(e, {"opacity": 1}), (e + .4, {"opacity": ghost})]
            kf(name.format(w + 1), pts)


SWATCH = {
    "box": '<rect {a} x="0" y="{y6}" width="12" height="12" rx="3"/>',
    "dot": '<circle {a} cx="6" cy="{y}" r="6"/>',
    "bar": '<rect {a} x="0" y="{y3}" width="12" height="6" rx="2"/>',
    "pip": '<circle {a} cx="6" cy="{y}" r="5"/>',
}


def legend(items, x=110, y=88, dy=20):
    """Legend markup for <!--LEGEND-->. items: [(swatch, colour, label)]; swatch in SWATCH.

    colour is a CSS colour (var(--job)) or a raw attribute (class="item")."""
    rows = []
    for i, (kind, c, label) in enumerate(items):
        a = c if "=" in c else f'style="fill: {c}"'
        sw = SWATCH[kind].format(a=a, y=i * dy, y6=i * dy - 6, y3=i * dy - 3)
        rows.append(f'    {sw}<text class="lg" x="20" y="{i * dy}">{label}</text>')
    return "\n".join([f'  <g transform="translate({x} {y})">'] + rows + ["  </g>"])


def fill(s, still, legend=None):
    """Fill the template placeholders: {D} loop seconds, {STILL} reduced-motion frame, <!--LEGEND-->, <!--ELEMENTS-->."""
    lg = LEGEND if legend is None else legend
    s = s.replace("{D}", f"{D:g}").replace("{STILL}", f"{still:g}").replace("<!--LEGEND-->", lg.strip())
    return s.replace("<!--ELEMENTS-->", "\n".join(elements)) if elements else s


def render(tpl, out_path, still, legend=None):
    """Write the SVG: template + one animation-name rule and one @keyframes per kf() call.

    tpl is a template path, or the template text itself (starts with "<svg"), so several diagrams can share
    one template and str.replace() their differences in the generator."""
    names = "\n".join(f"    #{n} {{ animation-name: {n}; }}" for n, _ in rules)
    frames = "\n".join(css(n, pts) for n, pts in rules)
    text = tpl if tpl.lstrip().startswith("<svg") else open(tpl).read()
    s = fill(text, still, legend).replace("/*KEYFRAMES*/", (names + "\n" + frames).strip())
    open(out_path, "w").write(s)


if __name__ == "__main__":  # self-check
    assert pct(4) == "25%" and pct(1) == "6.25%"
    kf("x", [(4, {"opacity": 1})])
    D = 32.0                             # D set after kf(): still converted with the final value
    assert css(*rules[-1]) == "    @keyframes x { 0% { opacity: 1; } 12.5% { opacity: 1; } 100% { opacity: 1; } }", css(*rules[-1])
    D = 16.0
    assert merge([(0, 1), (1.2, 2), (5, 6)], pad=.3) == [(0, 2), (5, 6)]
    p = Path(0, 0, 0, 10).to(10, 0, op=1).to(10, 5)
    assert p.t == 1.5 and p.pts[-1] == (1.5, {"opacity": 1, "transform": "translate(10px, 5px)"})

    pool = Pool(3)                       # 1 idle at start, limit 3
    assert pool.take(1) == 0             # reuse the idle one
    assert pool.take(1.4) == 1           # spawn on demand
    assert pool.take(1.8) == 2
    pool.release(1, 3, keep=True)        # stays idle
    pool.release(2, 3.5, keep=True)
    pool.release(0, 4, keep=False)       # retires
    assert pool.take(5) == 2             # LIFO: last idle first
    assert pool.alive[0] == [(0, 4.35)] and pool.alive[1] == [(1.4, None)]
    full = Pool(1, idle=0)
    full.take(0)
    try:
        full.take(1)
        raise SystemExit("take on a full pool must fail")
    except AssertionError:
        pass

    rules.clear()
    bar("t", [(1, 3), (3.1, 5, .5)])           # restarted at 3.1 before the fade, then cancelled at half
    out = css(*rules[-1])
    assert "18.75% { opacity: 1; transform: scaleX(1); } 19.38% { opacity: 1; transform: scaleX(0); }" in out, out  # no fade
    assert "31.25% { opacity: 1; transform: scaleX(0.5); }" in out, out
    states("st", [(0, 0), (2, 1), (5, 0)], 2)
    assert css(*rules[-2]) == "    @keyframes st0 { 0% { opacity: 1; } 12.5% { opacity: 1; } 13% { opacity: 0; } 31.25% { opacity: 0; } 31.75% { opacity: 1; } 100% { opacity: 1; } }", css(*rules[-2])
    elements.append('<circle id="seg0" class="a dot" r="6"/>')
    assert fill("<svg><!--ELEMENTS--></svg>", 1) == '<svg><circle id="seg0" class="a dot" r="6"/></svg>'
    elements.clear()

    print(legend([("box", 'class="item"', "waiting"), ("dot", "var(--job)", "moving")]))
    print("kfu self-check ok")

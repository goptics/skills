// Shared data layer of the reel: sizes, layouts, highlighter, timeline, captions. No DOM, no I/O, so the same module
// runs in the page (index.html, cover.html, slides) and in Node (render.mjs and the renderers).

// Video layout per size. 9:16 keeps text clear of the bottom ~350px and right ~120px, where the platforms draw their UI.
export const LAYOUTS = {
  "9:16": { W: 1080, H: 1920, mode: "stack", pad: 40, head: [60, 110], title: 76, chip: 30, top: 330, code: 30, cap: 52, capInset: [60, 120], safe: 350 },
  "1:1":  { W: 1080, H: 1080, mode: "stack", pad: 40, head: [60, 56], title: 56, chip: 24, top: 220, code: 24, cap: 38, capInset: [60, 60], safe: 50 },
  "16:9": { W: 1920, H: 1080, mode: "side", pad: 60, head: [80, 60], title: 68, chip: 26, top: 250, code: 28, cap: 44, capInset: [80, 80], safe: 60, split: 860 },
};

// Cover layout per size. 9:16: everything inside the 1080x1350 middle band (y 285-1635) that profile grids show.
export const COVERS = {
  "9:16": { W: 1080, H: 1920, band: [285, 1635], mode: "col", crop: 1040, h1: 128, logo: 380, chip: 34, foot: 40, gap: 52 },
  "1:1":  { W: 1080, H: 1080, band: [40, 1040], mode: "col", crop: 960, h1: 96, logo: 300, chip: 28, foot: 32, gap: 32 },
  "16:9": { W: 1920, H: 1080, band: [60, 1020], mode: "side", crop: 960, h1: 120, logo: 380, chip: 32, foot: 36, gap: 40 },
};

export const SIZES = Object.keys(LAYOUTS);

/** Size to use: an explicit choice (?size=, --size), else scenes.json "size", else 9:16. Throws on unknown sizes. */
export function pickSize(R, choice) {
  const size = choice ?? R.size ?? "9:16";
  if (!LAYOUTS[size]) throw new Error(`unknown size ${size}; use one of ${SIZES.join(", ")}`);
  return size;
}

/** Scenes with absolute start/end seconds, and the total length. */
export function timeline(R) {
  let t = 0;
  const scenes = R.scenes.map(s => ({ ...s, start: t, end: (t += s.duration) }));
  return { scenes, total: t };
}

/** [width, height] from an SVG's viewBox, so layout is known before the diagram loads. */
export function viewBox(svg) {
  const vb = svg.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
  return vb ? [+vb[1], +vb[2]] : [960, 420];
}

/** SRT: each scene's caption from 1.2s after it starts (when it fades in) to 0.3s before it ends. */
export function srt(scenes) {
  const ts = t => new Date(t * 1000).toISOString().slice(11, 23).replace(".", ",");
  return scenes.filter(s => s.caption).map((s, i) =>
    `${i + 1}\n${ts(s.start + 1.2)} --> ${ts(s.end - .3)}\n${s.caption.replace(/<[^>]+>/g, "")}\n`).join("\n");
}

// ---- highlighter: one token regex per language; ⟦…⟧ marks a highlight. go, js/ts, python, rust, sh; else plain ----
const KW = {
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
  js: "async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof interface let new null of return static super switch this throw true try type typeof undefined var void while yield",
  py: "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
  rs: "as async await break const continue crate dyn else enum Err extern false fn for if impl in let loop match mod move mut None Ok pub ref return Self self Some static struct super trait true type unsafe use where while",
};
const ALIAS = { golang: "go", ts: "js", typescript: "js", javascript: "js", tsx: "js", jsx: "js", python: "py", rust: "rs", bash: "sh", shell: "sh", zsh: "sh" };
export const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tokenizer(lang, pkgs) {
  const com = lang === "py" ? "#.*" : "\\/\\/.*";
  const str = lang === "rs" ? '"(?:[^"\\\\]|\\\\.)*"' : lang === "go" ? '"(?:[^"\\\\]|\\\\.)*"|`[^`]*`'
    : '"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'' + (lang === "js" ? "|`[^`]*`" : "");
  const pkg = pkgs.length ? `\\b(${pkgs.join("|")})\\b(?=\\.|::)` : "((?!))";   // keep the group: match indexes below
  return new RegExp(`(${com})|(${str})|\\b(${KW[lang].replace(/ /g, "|")})\\b|${pkg}|\\b(\\d[\\d_.]*)\\b|\\b([A-Za-z_]\\w*!?)(?=\\(|!\\()`, "g");
}

/** One line of code as HTML spans (classes kw, str, com, num, fn, pkg); pkgs = names coloured as packages. */
export function highlight(line, lang, pkgs = []) {
  lang = ALIAS[lang] ?? lang;
  let html;
  if (lang === "sh") {        // command (+ subcommand when there are arguments), strings, comments
    html = esc(line).replace(/^(\s*)([\w./-]+(?:\s+[a-z][\w-]*(?=\s+\S))?)|("[^"]*"|'[^']*')|(#.*)$/g, (m, sp, cmd, s, c) =>
      cmd ? `${sp}<span class="fn">${cmd}</span>` : `<span class="${s ? "str" : "com"}">${m}</span>`);
  } else if (KW[lang]) {
    html = esc(line).replace(tokenizer(lang, pkgs), (m, com, str, kw, pkg, num, fn) =>
      `<span class="${com ? "com" : str ? "str" : kw ? "kw" : pkg ? "pkg" : num ? "num" : "fn"}">${m}</span>`);
  } else html = esc(line);    // unknown language: plain text
  return html.replace(/⟦/g, "<mark>").replace(/⟧/g, "</mark>");
}

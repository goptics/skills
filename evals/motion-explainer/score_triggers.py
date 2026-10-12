"""Trigger check for skills/motion-explainer: does `claude -p` load the skill as its first tool call?

    python3 evals/motion-explainer/score_triggers.py [--runs 2] [--model claude-opus-5-5] [--workers 6]

Registers the skill under its real name (as .claude/commands/motion-explainer.md in a temp folder) with the
description from SKILL.md, runs every query in triggers.json, and scores should_trigger. Slash-command queries
are skipped: a real /motion-explainer runs the command directly, with no tool call to detect.
Note: other skills and hooks installed for your user still compete, which is what real use looks like.
"""
import argparse, json, os, re, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
SKILL = HERE.parents[1] / "skills" / "motion-explainer" / "SKILL.md"


def description():
    front = SKILL.read_text().split("---")[1]
    m = re.search(r"^description: >\n((?:  .*\n)+)", front, re.M)
    return " ".join(line.strip() for line in m[1].splitlines())


def first_tool(cwd, query, model):
    p = subprocess.run(["claude", "-p", query, "--model", model, "--output-format", "stream-json", "--verbose", "--max-turns", "1"],
                       cwd=cwd, capture_output=True, text=True, timeout=180,
                       env={k: v for k, v in os.environ.items() if k != "CLAUDECODE"})
    for line in p.stdout.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") == "assistant":
            for c in e["message"]["content"]:
                if c.get("type") == "tool_use":
                    return c["name"] == "Skill" and c["input"].get("skill") == "motion-explainer", f'{c["name"]} {c["input"].get("skill", "")}'
    return False, "no tool call"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--model", default="claude-opus-5-5")
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    evals = [e for e in json.loads((HERE / "triggers.json").read_text()) if not e["query"].startswith("/")]
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / ".claude" / "commands").mkdir(parents=True)
        (Path(d) / ".claude" / "commands" / "motion-explainer.md").write_text(
            f"---\ndescription: |\n  {description()}\n---\n\n# motion-explainer\n")
        jobs = [e for e in evals for _ in range(a.runs)]
        with ThreadPoolExecutor(a.workers) as ex:
            res = list(ex.map(lambda e: (e, *first_tool(d, e["query"], a.model)), jobs))
    ok = sum(t == e["should_trigger"] for e, t, _ in res)
    print(f"{ok}/{len(res)} correct")
    for e, t, tool in res:
        if t != e["should_trigger"]:
            print(f"  expected {e['should_trigger']}, first tool: {tool}: {e['query'][:80]}")
    raise SystemExit(ok != len(res))


if __name__ == "__main__":
    main()

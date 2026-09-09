# goptics skills

Agent skills for [goptics](https://github.com/goptics) tools. Install with the [skills CLI](https://github.com/vercel-labs/skills).

```bash
# this project
npx skills add goptics/skills

# every project on this machine
npx skills add goptics/skills -g

# one skill
npx skills add goptics/skills --skill vizb

# confirm the CLI can see it
npx skills add goptics/skills --list
```

The CLI clones this small pack (not each product repo) and copies `skills/<name>/` into your agents (Grok, Claude Code, Cursor, Codex, and others).

## Skills

| Skill | Product |
|---|---|
| `vizb` | [vizb](https://vizb.goptics.org) — CSV, JSON, and benchmark HTML charts. Docs: [AI agents](https://vizb.goptics.org/getting-started/ai-agents/). |

Skill install is not binary install. If `vizb` is missing, the skill runs the [vizb install](https://vizb.goptics.org/getting-started/install) one-liners.

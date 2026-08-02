---
name: wireframe
description: >
  Build a UI wireframe and open it in an interactive review workspace where the
  user comments directly on the page, turning those comments into the next
  iteration — or point the same workspace at an app that is already running and
  review the real thing. Use when the user wants a wireframe, UI mockup, screen
  design or prototype; wants to review, annotate, or comment on a page, design,
  existing UI, running app or website; wants to iterate on a UI; or runs
  /wireframe.
---

# Wireframe (Grok host)

You are the **Grok** Host for Visual Stack wireframe review.

1. **Set the host** for every review-server process in this session:
   ```bash
   export VSTACK_HOST=grok
   ```
   Pass `--host grok` on `serve` as well so the workspace UI says Grok.

2. **Load the Grok adapter** (maps Host ops → Grok tools):
   - Read `plugins/vstack/skills/wireframe/hosts/grok.md` relative to the
     visual-stack repository root (this project).

3. **Follow the tool-agnostic skill** for the full loop (build, serve, events,
   publish, live review, handoff):
   - Read `plugins/vstack/skills/wireframe/SKILL.md`
   - Contracts (if you need the formal surface): `plugins/vstack/contracts/`

4. **Paths:** `$SKILL` for CLI commands is
   `plugins/vstack/skills/wireframe` under this repo (assets live there).

Do not use Claude Code tool names (Monitor, Artifact, TaskStop, run_in_background).
Use only the ops mapped in `hosts/grok.md`.

---
name: go
description: Figure out where the Visual Stack can pick up and help — in any conversation, in any project, with zero setup. Reads the pipeline state if the project has one, otherwise infers from the conversation and the directory. Use when the user types /vstack or vstack, asks "what now?", "what's next?", "where were we?", wants to pick up or resume visual-stack work, or wants to know how the visual stack could help with whatever is being discussed.
---

Answers one question — **"what now?"** — from wherever the user happens to be. No arguments, no setup,
no prerequisite state. The user should be able to type this mid-conversation, mid-project, or on a
blank directory and get one concrete, correct suggestion.

One rule decides everything:

> **`.vstack/pipeline.json` exists → pipeline mode. It doesn't → inference mode.**

## Pipeline mode — read the state, offer the successor

Read `.vstack/pipeline.json`. Before trusting it, **verify the artifacts are real**: every path under
`artifacts.*` should exist on disk. One that doesn't means the file is ahead of reality — say which,
and treat the producing stage as not-yet-run rather than pretending.

Then report position in one short block — stage, phase, what exists — and offer the next stage:

| Last completed (`stage`) | Successor to offer |
|---|---|
| `start` (or legacy `init`) | `requirements` → **not built** — offer writing `specs/requirements.md` together, or straight to `/vstack:wireframe` |
| `requirements` | `/vstack:wireframe` |
| `wireframe` | `/vstack:spec` |
| `spec` | `/vstack:user-story-map` |
| `user-story-map` | `/vstack:phase-preview` |
| `phase-preview` | `/vstack:phase-build` — builds phase `phase` |
| `phase-build` | phases remain → `/vstack:phase-preview` for the next phase (or `/vstack:phase-build` directly if its wireframes exist); otherwise the chain is done |
| `"done"` | say so; offer another feature pass through `/vstack:wireframe` |

If `"specsOnly": true`, `phase-build` doesn't apply — the chain for this project is
wireframe → spec → story map → phase screens, and adding development later is `/vstack:start`
again.

**Offer, don't interrogate.** Name the successor and offer to run it — never ask *"shall I
continue?"* in the abstract, and never refuse a jump to any other stage the user names. For a stage
that isn't built, say so plainly and offer the nearest thing that is; don't improvise the missing
stage.

## Inference mode — work out where the stack can help

No state file. Two things to look at, in order:

1. **The conversation.** What has the user been doing here — describing an idea? Iterating on a UI?
   Arguing scope? Debugging code? The chat is usually the stronger signal.
2. **The directory.** Cheap checks, no deep read: is it a git repo with real code? Are there HTML
   wireframes (`design/*.html`, or any standalone page being discussed)? A `specs/` directory? A
   `story-map.json`? A `.vstack/local/wireframe/` directory from past wireframe rounds?

Map what you find to an entry point:

| Situation | Entry point |
|---|---|
| An idea is being discussed; little or nothing on disk | `/vstack:start` — or `/vstack:wireframe` directly if they just want to see a screen |
| A UI, screen, or design is being discussed, or wireframes exist | `/vstack:wireframe` — build it, or open the existing page for review |
| A UI that already exists is being critiqued — an app that runs, or a website ("the UI needs work", "I have comments on the admin", "look at their pricing page") | `/vstack:wireframe` — its live mode proxies the target so comments land on the real screens |
| Acceptance criteria, "what exactly should it do", or a wireframe that needs formalising | `/vstack:spec` |
| Scope, phases, releases, or "what's in v1" is being discussed | `/vstack:user-story-map` |
| A story map and a signed-off wireframe both exist | `/vstack:phase-preview` |
| "Build it" — a spec or story map exists and the ask is implementation | `/vstack:phase-build` |
| A real codebase with no vstack state | `/vstack:start` — its existing-app mode records the project without touching code |

Lead with **one** suggestion — the single best fit, stated concretely in terms of what's actually in
the conversation (*"want me to turn the pricing-page sketch you just described into a wireframe you
can comment on?"*), then the short menu of the rest in one line each. Don't present a questionnaire,
and don't run anything until the user picks.

## Notes

- This skill **writes nothing**. It reads, reports, and offers. The stage it hands off to owns all
  writes — including `pipeline.json`.
- Preserve unknown keys if a later stage does rewrite state; a newer skill's field must survive an
  older one's read-modify-write. (Stated here because this skill is where schema drift gets noticed —
  if `pipeline.json` has keys you don't recognise, that's fine and expected.)
- A dirty tree, a half-finished stage, or artifacts newer than `history` are worth mentioning in the
  position report — `stage` records the last *completed* stage, and "started and abandoned" is
  invisible to it.
- For a true bare `/vstack` (no `:go`), the README documents copying this skill to
  `~/.claude/skills/vstack/` — plugin skills are always namespaced, personal skills aren't.

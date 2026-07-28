---
name: init
description: Start a new project from the cavalry-template-spa template — clone it, choose the stack pack and add-ons on a visual chooser, delete what isn't wanted, and work through the Day-1 checklist so the repo is ready to build in. Use when the user wants to start a new project, scaffold a repo, set up a codebase from the Cavalry template, pick a stack or add-ons, or run Day-1 setup.
---

Turns the template into *this* project. One clone, one chooser, then the Day-1 checklist — after which every
`CLAUDE.md` in the repo describes a real stack rather than a set of options.

```
cavalry-template-spa ──► clone ──► chooser ──► delete the rest ──► toolchain ──► design guide ──► ready
                                  (stack + add-ons)
```

**Adoption is deletion.** The template's contracts activate by what survives: exactly one directory under
`stacks/`, and only the wanted directories under `add-ons/`. So this skill ends by removing most of what it
just cloned — say that out loud *before* the deletions, because it looks alarming otherwise.

## 1 · Find out where it's going

Ask, in one message, only what you can't infer:

- **Project name** and where the directory should go.
- **GitHub repo now, or local only?** It decides which clone to use in §2.

If the current directory is already template-derived — `stacks/`, `add-ons/`, `design/`, `specs/` all present —
don't clone. Say so, and pick up from §3 (or §5 if a pack has already been chosen).

## 2 · Clone

**With a GitHub repo** — keeps the template link and the history clean:

```bash
gh repo create <name> --template Cavalry-Collective/cavalry-template-spa --private --clone
```

**Local only:**

```bash
git clone --depth 1 https://github.com/Cavalry-Collective/cavalry-template-spa.git <name>
rm -rf <name>/.git && git -C <name> init && git -C <name> add -A
```

Then read the contracts before touching anything — root `CLAUDE.md`, `apps/backend/CLAUDE.md`,
`apps/frontend/CLAUDE.md`, `db/CLAUDE.md`, `infra/CLAUDE.md`. They are what everything below is filling in.
*(Day-1 steps 1–4.)*

## 3 · Serve the chooser

```bash
SKILL=<this skill dir>
node "$SKILL/assets/chooser-server.mjs" --repo <project dir> --port 7799
```

Start it with **`run_in_background: true`**, then tell the user to open **http://localhost:7799/**.

It reads `stacks/` and `add-ons/` from the repo, so the page offers what the template actually ships — a pack
added upstream appears with no change here. It asks **once**: on send it writes
`<repo>/.vstack/choice.json` and exits. Nothing stays listening.

Wait for it with **`run_in_background: true`** — the exit re-invokes you:

```bash
CHOICE=<repo>/.vstack/choice.json
until [ -f "$CHOICE" ]; do sleep 1; done
cat "$CHOICE"
```

If the user would rather answer in chat, that's fine — ask the two questions in prose and write the same JSON
yourself. The chooser is the nicer path, not the only one.

**Ask in product terms, never by directory name**, whichever path you take. Someone on day zero can answer
*"will several organisations share one deployment, with their data kept separate?"*; nobody can answer
*"do you want multi-tenancy?"*. The card titles are the shorthand, not the question.

## 4 · Apply the choice

`choice.json` carries `pack`, `addons`, and an explicit `deleting` list. Show the deletions, get a yes, then:

```bash
cd <repo>
for p in $(jq -r '.deleting.packs[]'  .vstack/choice.json); do rm -rf "stacks/$p"; done
for a in $(jq -r '.deleting.addons[]' .vstack/choice.json); do rm -rf "add-ons/$a"; done
```

Then record the choice in root `CLAUDE.md` **Learnings**: `Stack: <pack>; appendices under stacks/<pack>/`.
*(Day-1 steps 5–6.)*

## 5 · Fill the toolchain

From the surviving pack's `README.md`:

- Its **dev** command block → the root `CLAUDE.md` *Common commands* placeholder. Delete the banner.
- Its **CI** block → `.github/workflows/ci.yml`. **These are different blocks** — a dev-only migration command
  in CI is a real bug, not a typo.
- `.github/workflows/deploy.yml` — fill the TODO, or delete the stub if the pack's conflict register says to.
- Add a real `.env.example`.
- Wire the remaining `ci.yml` gates the pack doesn't cover: the i18n key-parity check, the migration up/down
  round-trip, and the a11y scan.

*(Day-1 step 7.)*

## 6 · Form factor and the design guide

- **Primary form factor** in `apps/frontend/CLAUDE.md` — `mobile-first`, `desktop-first` or `responsive-equal`.
  Ask; it isn't inferable and it changes every screen. *(Step 8.)*
- **Rebrand and confirm the design guide.** Edit the *primitive* tier in `design/tokens.css` to the project's
  brand, then open `design/design-guide.html` and have the user confirm it reads as one system. **This gates
  everything visual** — no screen gets built against an unconfirmed system, so don't skip it to move faster.
  *(Step 9.)*
- **Copy runtime config** — `.env` and any secrets, which don't come from the template. *(Step 10.)*

## 7 · Hand back the repo-level steps

Steps 11–13 are GitHub settings and a live push, not file edits: **protect `main`** with a required-CI rule,
**stand up staging** if the pack defines one, and **confirm green** on the first CI run.

**Don't do these unasked.** Print them as a checklist the user can run, and offer to do any of them on request.
Branch protection in particular has to be installed *after* the first green push, or a required-status rule
rejects a branch whose CI has never run.

Then confirm no placeholder survived — both must return nothing:

```bash
grep -rn 'FILL IN ON SETUP\|TODO: replace' . --exclude-dir=stacks --exclude-dir=specs --exclude-dir=.git \
  | grep -v '^\./README\.md:'
grep -n '^<pm> ' CLAUDE.md
```

Delete the template's own root `README.md` once instantiation is done — its Day-1 checklist is spent.

## Notes

- **Never edit `assets/chooser.html` or `chooser-server.mjs`** to fit a project — they're the engine.
- The chooser is a **one-shot** by design: it asks a single question, so it doesn't use the live-link machinery
  behind `wireframe` and `user-story-map`. Don't wire it into them.
- Unknown directories still work. A pack or add-on the chooser has no blurb for renders from its own README,
  so an upstream addition never breaks the page.
- `--out` moves `choice.json`; `--port` moves the port. Port busy usually means a chooser is already running.
- Opened straight off disk with no server, the page shows the JSON to copy instead of sending. Nothing is lost.

## State & handoff

- **Read** nothing — this is where the pipeline begins.
- **Write** `<repo>/.vstack/pipeline.json`, the file every later stage reads:
  ```json
  { "version": 1, "project": "<name>", "stage": "init", "phase": null,
    "artifacts": { "stack": "<pack>", "addOns": ["…"] },
    "history": [{ "stage": "init", "at": "<iso>", "note": "<pack> + N add-ons" }] }
  ```
  Commit it — it's a project record, not scratch. Keep `.vstack/choice.json` beside it as the raw answer.
- **Next** — `/vstack:requirements` writes `specs/requirements.md`. **That stage isn't built yet**; until it
  is, say so and offer the two things that are: write `specs/requirements.md` by hand together, or go straight
  to a first screen with `/vstack:wireframe`. Don't invent a requirements stage to fill the gap.

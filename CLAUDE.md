# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Visual Stack — a coding-agent plugin for interactive wireframing and UI review.
The user comments directly on a wireframe (or a running app) in a browser
workspace; the agent applies the feedback and publishes the next version into
the same workspace. The repo is a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`) with one plugin, `plugins/vstack/`, which
also ships a Codex manifest (`.codex-plugin/`) and a Grok host adapter
(`skills/review/hosts/grok.md`).

**This repo is the thing people install; nothing is installed into it.** No
`.grok/skills/`, no `.claude/skills/`, no vendored copy of our own plugin — a
host that discovers skills from a project directory gets instructions in its
host adapter, not a checked-in skill directory that then has to be kept in sync.

Plain Node ≥ 18 ES modules, standard library only. There is no package.json,
build step, bundler, or linter. (`node_modules/` at the root appears only when
recording the README demo, which installs playwright-core.)

## Commands

Tests are standalone Node scripts — run them directly, one file per suite:

```bash
node plugins/vstack/skills/review/tests/review-lifecycle.mjs   # end-to-end review server round-trip
node plugins/vstack/skills/review/tests/host-profiles.mjs      # host profiles conform to host.schema.json
node plugins/vstack/skills/review/tests/workdir.mjs            # .vstack/local working-dir resolution
```

The shared UI shell is stamped into pages, not linked (see below):

```bash
node plugins/vstack/lib/build-shell.mjs stamp    # write lib/shell/ into every page
node plugins/vstack/lib/build-shell.mjs check    # exit 1 if any page has drifted
```

## Architecture

### Contracts / engine / adapters / profiles

The layering rule that everything else follows (`plugins/vstack/contracts/README.md`):

- **Contracts** (`plugins/vstack/contracts/`) define what a coding-agent host
  must provide (`host.md`), the review protocol (`review-loop.md`), and the
  bridge protocol (`bridge-loop.md`). The engine and skills depend only on these.
- **The engine speaks contracts.** `review-server.mjs`, the workspace pages, and
  the shared shell never name a product (Claude, Codex, Grok) except as data
  from a Host profile.
- **Adapters speak hosts.** Only `skills/review/hosts/*.md` may mention
  host-specific tools (Monitor, Artifact, etc.). A SKILL.md references Host ops
  (`background`, `watch_stream`, `share`, …); the adapter maps them to tools.
- **Profiles are data.** `hosts/<id>.json` carries UI labels, install steps, and
  capability flags; servers inject it as `window.__VSTACK_HOST__`, selected by
  `--host` / `VSTACK_HOST` (default `claude`). Loaded via `lib/host.mjs`.
- **On-disk roles are stable:** review threads use `by: "agent" | "reviewer"`.
  Older files may say `"claude"`; readers treat that as `"agent"`.

### Two engines, one live-link protocol

- `skills/review/assets/review-server.mjs` — the wireframe review loop. Serves
  a self-contained HTML page inside the workspace, or reverse-proxies a running
  app (`--app`) so the workspace shares an origin with what it annotates (that
  origin-sharing is why comments can attach to elements, not coordinates). CLI
  subcommands (`publish`, `claim`, `reply`, `cancelled`, `share`, `status`,
  `check`, `watch`) drive the protocol; sentinels and round records live on disk.
- `lib/json-bridge.mjs` — the live link for JSON-document pages (user-story-map,
  plus the experimental spec and phase-build tools): the page POSTs saves and
  bumps a seq counter the agent's watcher wakes on; agent edits are pushed back
  over SSE.

Both share `lib/live-link.mjs`: a `watching` heartbeat file that says an agent
session is listening, atomic write-then-rename, and one protocol-wide staleness
constant — so the invariants can't drift between engines. Servers bind to
`127.0.0.1` only and close themselves when the browser tab goes away
(SSE idle timeout).

### Self-contained pages and the stamped shell

Every page (workspace, spec tree, story map, build board…) must work three
ways: served over http, opened off disk, and inlined into an Artifact under a
CSP that blocks all external requests. So nothing is linked at runtime — the
shared shell (`lib/shell/`: tokens, top bar, scrubber, `window.VSShell` /
`window.VSScrub`) is **copied into each page** by `lib/build-shell.mjs` between
`vstack:shell` markers. Edit `lib/shell/`, run `stamp`, commit both. Never
hand-edit a stamped region; page-specific controls go in `vstack:slot` blocks,
which survive stamping. New pages register in the `PAGES` list in
`build-shell.mjs`.

### On-disk state

Every tool writes per-machine state under `<root>/.vstack/local/<tool>/`
(gitignored via `**/.vstack/local/`); the rest of `.vstack/` (pipeline.json,
specs/, build/) is the pipeline and belongs in the repo. `lib/workdir.mjs`
resolves the directory — use it rather than joining paths by hand.

**Renaming a tool does not rename the directory it already filled.** `workdir.mjs`
keeps a `LEGACY` map of a tool's former directory names; `subjectDir()` reads a
subject from the first directory that holds it and creates new ones under the
current name, and `toolNames()` gives every name to callers that enumerate. Add
to `LEGACY` when you rename a tool — never migrate a user's rounds behind their
back. Review's rounds sat in `local/wireframe/` before the tool was renamed.

### Skills

Each skill is `plugins/vstack/skills/<name>/SKILL.md` plus `assets/` (the pages
and servers it runs). `review` is the primary tool and `user-story-map` ships
alongside it; `wireframe` is a compatibility entry that reads `review/SKILL.md`
and nothing else — it is what `review` used to be called. Engine
assets (`workspace.html`,
`review-server.mjs`, `bundle-artifact.mjs`) are never edited to fit a project —
only the page under review is.

`plugins/vstack/experimental/` holds the earlier project-planning tools (spec,
start, phase-build, phase-preview) and the retired `/vstack:go` alias in the
same `<name>/SKILL.md + assets/` shape. They are parked outside `skills/` on
purpose so no host discovers them as installable skills; their pages still
carry the stamped shell and are kept from drifting by `build-shell.mjs`.
Moving one back under `skills/` is the whole act of re-releasing it.

## Coding standards

Keep cross-cutting concerns in shared modules, and keep `lib/` pure.
(Libraries-over-hand-rolling is a Principle below.)

- **Configuration.** All runtime config is read from the environment in one
  place and validated at startup against a declared schema, so a missing or
  malformed value fails fast with a clear, named error rather than misbehaving
  mid-request. No inner layer reads config directly — it is passed inward as
  values.

### Readability and Naming

Readable code is a review priority. A reviewer should understand intent from
names alone.

- Names are precise and state business meaning, not mechanics.
- No abbreviations unless standard in the domain or codebase. No misleading
  names. No single-letter variables outside trivial loop counters and
  conventional math.

#### Comments

- Comments explain **why** — the constraint, tradeoff, or external quirk behind
  the code — never what.
- Delete any comment that repeats what the code says.
- Notes to the reviewer ("fixed X here") go in the commit message, not in
  comments.

## Documentation style

Applies to every Markdown document in this repo.

- Write plain business English. Say it the way you would explain it to a
  colleague.
- Lead with the purpose. Open a document or section with why it exists, then
  drill into detail. Edge cases and notes go at the end.
- One idea per sentence. One rule per bullet. Prefer bullets and numbered lists
  over paragraphs. Use tables for reference material (keys, codes, bounds).
- Make a person or the system the subject.
- No slogans, no compressed abstractions. Contrast is fine when it prevents a
  mistake ("return 404, not 403"); drop it when it is only for effect
  ("assertions, not hopes").
- No em-dash chains or nested parentheticals. If a sentence needs more than one
  qualifier, split it.
- State rules imperatively. Rationale and rejected alternatives live in the
  document's designated notes/decisions section, never inline with the rule.
- No document history or meta-narration. Don't describe how the document came to
  be, what moved where, or what another file deliberately omits.
- State a rule once, in the document that owns it. Link to it from everywhere
  else.
- Exception: verbatim contract strings and copy-paste command blocks are never
  reworded for style.

## Principles (must follow)

Load-bearing engineering rules; honor them on every change. They are stack- and
tooling-agnostic.

- **Think before coding.** Don't assume, don't hide confusion, surface
  tradeoffs. State your assumptions and ask when uncertain; present multiple
  interpretations rather than silently picking one; suggest simpler alternatives
  and respectfully push back when warranted; stop and name what's confusing
  rather than proceeding on unclear requirements.
- **Simplicity first / YAGNI.** Write the minimum code that solves the problem.
  No unrequested features, no abstractions for single-use code, no
  configurability or error handling for cases that can't occur. "We might want
  it later" is not a reason. If 200 lines could be 50, rewrite.
- **Change the right place, surgically.** First identify *where* a change
  belongs — the correct layer and boundary — and make it there; don't patch
  wherever is convenient. Then touch only what you must: match the surrounding
  style and conventions (error handling, logging, validation), don't reformat or
  refactor unrelated working code, flag unrelated dead code without removing it,
  and remove only the imports/variables your own change orphaned.
- **Goal-driven execution.** Define success criteria and loop until verified.
  Turn requests into measurable objectives with a brief plan and a verification
  step per phase, so each phase can iterate to a clear success marker. Verified
  means observed, not inferred: before calling a change done, run it and state
  the evidence you saw.
- **Don't reinvent existing solutions.** Use established libraries and project
  utilities for dates, money, validation, retry, pagination, parsing, and
  formatting rather than hand-rolling them — especially date/timezone math.
  Don't duplicate existing abstractions or wrap a library without a clear
  reason. Before adding a new dependency, confirm an existing dependency or
  shared util doesn't already cover it, and prefer well-maintained,
  widely-used, permissively-licensed packages. A trivial, stable one-liner
  doesn't earn a dependency — but dates, money, timezones, auth, and crypto
  always do; never hand-roll those.
- **Don't overfit to the immediate request.** Solve the general problem, not
  just the demonstrated case. Avoid hardcoding strings, IDs, statuses, roles, or
  regions; handle the empty, invalid, duplicate, retry, timeout, and permission
  cases, not only the happy path; and write tests that assert behavior rather
  than mirror the implementation.
- **Keep implementations clean, not mechanical.** No noisy logs, no broad
  `try/catch` that hides errors, no unused parameters or dead branches, no
  defensive code without a clear failure model. (Comment rules: *Readability and
  Naming*.)

## Demo recordings (README GIFs)

Use these dimensions for every demo recording — they were tuned so the text
reads clearly in the README:

- **Browser viewport 920 × 760**, and export the GIF at native resolution —
  never downscale the frames.
- **Review the demo page at phone width** (the workspace's 390px size) with the
  canvas zoom locked at 100%. The workspace refits zoom on every version load
  (size switch, Review changes, timeline scrub), so a recording script must
  pin it — set zoom to 1 and no-op the refit for the session.
- Keep the subject app trivially simple (the todo list works well) so the
  before/after change is obvious at a glance.
- Keep it snappy: fast typing, short holds, ~1.4× speedup at assembly, and
  clamp idle gaps (e.g. the round-trip wait) to ~0.5s.
- Target: ~12 seconds, under 1 MB, saved to `docs/assets/wireframe-demo.gif`.

Recordings are scripted — headless Chrome via playwright-core driving the real
review server end to end (publish v1, comment, send, claim, publish v2), with
frames captured as JPEGs and assembled with ffmpeg (two-pass palette).

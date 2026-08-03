# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Visual Stack — a coding-agent plugin for interactive wireframing and UI review.
The user comments directly on a wireframe (or a running app) in a browser
workspace; the agent applies the feedback and publishes the next version into
the same workspace. The repo is a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`) with one plugin, `plugins/vstack/`, which
also ships manifests for Codex (`.codex-plugin/`) and a Grok skill mirror at
`.grok/skills/`.

Plain Node ≥ 18 ES modules, standard library only. There is no package.json,
build step, bundler, or linter. (`node_modules/` at the root appears only when
recording the README demo, which installs playwright-core.)

## Commands

Tests are standalone Node scripts — run them directly, one file per suite:

```bash
node plugins/vstack/skills/wireframe/tests/review-lifecycle.mjs   # end-to-end review server round-trip
node plugins/vstack/skills/wireframe/tests/host-profiles.mjs      # host profiles conform to host.schema.json
node plugins/vstack/skills/wireframe/tests/workdir.mjs            # .vstack/local working-dir resolution
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
- **Adapters speak hosts.** Only `skills/wireframe/hosts/*.md` may mention
  host-specific tools (Monitor, Artifact, etc.). A SKILL.md references Host ops
  (`background`, `watch_stream`, `share`, …); the adapter maps them to tools.
- **Profiles are data.** `hosts/<id>.json` carries UI labels, install steps, and
  capability flags; servers inject it as `window.__VSTACK_HOST__`, selected by
  `--host` / `VSTACK_HOST` (default `claude`). Loaded via `lib/host.mjs`.
- **On-disk roles are stable:** review threads use `by: "agent" | "reviewer"`.
  Older files may say `"claude"`; readers treat that as `"agent"`.

### Two engines, one live-link protocol

- `skills/wireframe/assets/review-server.mjs` — the wireframe review loop. Serves
  a self-contained HTML page inside the workspace, or reverse-proxies a running
  app (`--app`) so the workspace shares an origin with what it annotates (that
  origin-sharing is why comments can attach to elements, not coordinates). CLI
  subcommands (`publish`, `claim`, `reply`, `cancelled`, `share`, `status`,
  `check`, `watch`) drive the protocol; sentinels and round records live on disk.
- `lib/json-bridge.mjs` — the live link for JSON-document pages (spec,
  user-story-map, phase-build): the page POSTs saves and bumps a seq counter the
  agent's watcher wakes on; agent edits are pushed back over SSE.

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

### Skills

Each skill is `plugins/vstack/skills/<name>/SKILL.md` plus `assets/` (the pages
and servers it runs). `wireframe` is the primary tool; `go` is a compatibility
entry for the former `/vstack:go`. Engine assets (`workspace.html`,
`review-server.mjs`, `bundle-artifact.mjs`) are never edited to fit a project —
only the page under review is.

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

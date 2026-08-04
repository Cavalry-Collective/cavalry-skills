# Contract: Host

A **Host** is the coding-agent product that runs the skill (Claude Code, Codex, Grok
Build, …). The review engine does not call into a host. The *agent session*
running under a host fulfills these operations by using that host’s tools.

Every Host is described by a **profile** (`hosts/<id>.json`, schema
[`host.schema.json`](host.schema.json)). Servers load it; the workspace reads
`window.__VSTACK_HOST__`.

---

## Identity

| Field | Meaning |
| --- | --- |
| `id` | Stable key: `claude`, `codex`, `grok`, … — used as `VSTACK_HOST` / `--host` |
| `name` | Human label in UI (“Claude”, “Codex”, “Grok”) |

---

## Operations

These are the abstract operations the review skill (and later other skills)
require. Adapters map each op to concrete tools. Ops marked **required** must
work or the loop is not product-quality.

### `background(command)` — **required**

Start a process that **outlives the current agent turn**. Used for
`review-server.mjs serve …`.

- Must keep running after the turn ends.
- Must be stoppable via `stop`.
- Stdout/stderr should remain available for diagnosis.

### `watch_stream(command)` — **required**

Run a long-lived process whose **stdout is a line-delimited event stream**.
Each complete line is delivered to the agent as an event (without the agent
having to poll or re-arm). Used for:

```bash
node review-server.mjs watch --all --stream
```

- Process must not exit after the first event.
- Lines are UTF-8 text, one event per line (see [review-loop.md](review-loop.md)).
- While this process runs, the engine’s `watching` heartbeat is live and the UI
  shows **Linked**.

### `stop(handle)` — **required**

Terminate a process started by `background` or `watch_stream`.

### `run(command)` — **required**

Synchronous shell: `publish`, `reply`, `share`, `check`, `status`, file edits’
supporting commands. Blocks until exit; agent reads exit code and stdout.

### `edit` — **required**

Change files under review (the HTML wireframe, or app source in live mode). Any
file-edit capability the host exposes.

### `share(file | capture) → url` — **optional**

Publish a self-contained wireframe (or a live-review capture) to a URL the
reviewer can send to someone else. Profile flag:

| `capabilities.share` | Meaning |
| --- | --- |
| `artifact` | Host can produce a public URL; skill uses `share` op |
| `copy` | No public publish; UI offers copy-to-clipboard only |
| `none` | Hide share affordances |

When the capability is not `artifact`, the agent must not pretend a link was
published. Offline bundle mode already degrades to copy (review-loop).

### `browser_capture` — **optional**

Navigate, screenshot, and run in-page JS (e.g. `harvest-reference.js`). Profile:
`capabilities.browser: true | false`. If false, the skill uses screenshots the
user provides or skips harvest.

---

## Runtime injection

When serving a workspace, the server:

1. Resolves Host via `--host <id>` or env `VSTACK_HOST` (default `claude`).
2. Loads `plugins/vstack/hosts/<id>.json`.
3. Injects into the page:

```html
<script>window.__VSTACK_HOST__ = { …profile… }</script>
```

The workspace uses `name` (and related strings) for chrome. It never hardcodes
a product name.

Update banners use `install` from the same profile when the Host supports
update detection (`capabilities.updateDetect`).

---

## Adapter documents

For each Host id, `skills/review/hosts/<id>.md` maps every required op (and
optional ones the Host supports) to that product’s tools, with exact invocation
examples. The core `SKILL.md` only names the ops above — never product tools.

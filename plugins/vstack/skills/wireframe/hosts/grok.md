# Host adapter: Grok Build

Implements [contracts/host.md](../../../contracts/host.md) for **Grok Build**
(and the Grok coding TUI). Profile: `plugins/vstack/hosts/grok.json` (`id: grok`).

**Always** set the host so the workspace says “Grok”, not the default:

```bash
export VSTACK_HOST=grok
# or pass --host grok on serve (and prefer it on every command)
```

---

## Operation map

| Host op | Grok tool | How |
| --- | --- | --- |
| `background(cmd)` | `run_terminal_command` with `background: true` | `serve` must outlive the turn |
| `watch_stream(cmd)` | **`monitor`** tool, `persistent: true` | `watch --all --stream` — each stdout line is a chat event |
| `stop(handle)` | `kill_command_or_subagent` with the task id | After approve or when ending the review |
| `run(cmd)` | `run_terminal_command` (foreground) | `publish`, `claim`, `reply`, `check`, `cancelled`, `status` |
| `edit` | file edit tools (`search_replace`, `write`, …) | HTML wireframe or app source |
| `share(file)` | **Not available** as a public Artifact | Profile `capabilities.share: copy` — do not run the share-URL flow; UI hides “Publish a link” |
| `browser_capture` | Browser MCP / chrome-devtools when connected | Otherwise use user screenshots per skill §2 |

---

## Concrete start sequence

```bash
SKILL=<path to plugins/vstack/skills/wireframe>
FILE=wireframes/example.html

node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version" --host grok

# background: true
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host grok

# monitor, persistent: true
node "$SKILL/assets/review-server.mjs" watch --all --stream
```

Tell the user **http://localhost:7788/** (or `/__review/` for live `--app`).

---

## Events → agent turns

When `monitor` delivers a line:

| Line prefix | Action (same as [review-loop.md](../../../contracts/review-loop.md)) |
| --- | --- |
| `REVIEW` | `claim` the round, read `feedback.md`, apply, `publish` / `reply` — never delete protocol files |
| `REPLIED` | Continue that comment’s thread |
| `CANCELLED` | Do not publish half-work; run `cancelled --round <id>`; report |
| `SHARE` | Host has no artifact share — tell the user to copy/export the HTML, or use `bundle-artifact.mjs` for a file they can send |
| `APPROVED` | Confirm; offer next pipeline stage if applicable |
| `CLOSED` | Note the review ended |

During a long round, `check` before publish:

```bash
node "$SKILL/assets/review-server.mjs" check --file "$FILE" || echo STOP
```

Exit 2 means stop.

---

## Install / discovery

This repo ships a project skill at `.grok/skills/wireframe/` that points here.
Elsewhere: symlink or copy `plugins/vstack/skills/wireframe` into
`<grok-home>/skills/wireframe` or `<project>/.grok/skills/wireframe`, keeping
`hosts/`, `assets/`, and relative paths to `lib/` intact (prefer a clone of the
visual-stack repo and a thin entry skill that sets `VSTACK_HOST=grok` and reads
this tree).

Update banners are off for Grok (`updateDetect: none`); pull the repo to update.

---

## Notes

- Do not invent a public share URL. If they need a file to send, bundle or
  attach the HTML; optionally run `bundle-artifact.mjs` for a self-contained
  review copy (comments stay local / clipboard).
- Prefer one persistent `monitor` for `--all` rather than re-arming one-shot
  `watch` every round.

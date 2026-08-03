# Host adapter: Codex

Implements [contracts/host.md](../../../contracts/host.md) for **Codex**.
Profile: `plugins/vstack/hosts/codex.json` (`id: codex`).

Pass the host explicitly when starting a server. Codex shell calls do not
necessarily share exported environment variables:

```bash
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host codex
```

## Operation map

| Host op | Codex tool | How |
| --- | --- | --- |
| `background(cmd)` | persistent shell execution (`exec_command`) | Start with a short yield and retain the returned session id. The review server must stay alive. |
| `watch_stream(cmd)` | a second persistent `exec_command`, then `write_stdin` | Run `watch --all --stream`; poll the session with an empty write, normally for 30 seconds at a time, until it emits an event. Keep polling while reviews remain open. |
| `stop(handle)` | `write_stdin` | Send Ctrl-C (`\u0003`) to the retained server or watcher session. |
| `run(cmd)` | foreground `exec_command` | Use for `publish`, `claim`, `reply`, `check`, `cancelled`, `share`, and `status`. |
| `edit` | `apply_patch` | Change the wireframe or application source without overwriting unrelated work. |
| `share(file)` | no generic public Artifact publisher | Profile uses `capabilities.share: copy`; offer the HTML file or an offline bundle instead of inventing a URL. |
| `browser_capture` | Codex Browser controls, when installed | Navigate, resize, screenshot, and run `harvest-reference.js`. If Browser is unavailable, use screenshots supplied by the user. |

## Concrete start sequence

```bash
SKILL=<path to plugins/vstack/skills/wireframe>
FILE=wireframes/example.html

node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version"

# persistent exec session; retain its session id
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host codex

# second persistent exec session; retain and poll this session id
node "$SKILL/assets/review-server.mjs" watch --all --stream
```

Tell the user **http://localhost:7788/** (or `/__review/` for live `--app`).

## Events and turn lifetime

Codex does not need a product-specific Monitor tool. The streaming watcher is a
normal persistent command session:

1. Start it with `exec_command` and keep the returned session id.
2. Poll it with an empty `write_stdin`, using a bounded wait so the user keeps
   receiving progress updates.
3. On `REVIEW`, `REPLIED`, `CANCELLED`, `SHARE`, `APPROVED`, or `CLOSED`, follow
   the core skill and review-loop contract.
4. Resume polling after each published round. Do not send the final response
   while the review is still active; keep the Codex turn open until approval,
   closure, or an explicit request from the user to stop.

Use a 30-second poll in normal operation. If nothing arrives, send a brief
commentary update before continuing so the user is never left without visible
activity for more than a minute.

## Share

Codex has no generic Artifact-equivalent for this local review loop. The
workspace therefore hides the public-link request. If the user needs something
portable, attach the wireframe HTML or run `assets/bundle-artifact.mjs` to make
an offline review copy. Do not claim that either is a hosted public URL.

## Install and discovery

The plugin manifest at `plugins/vstack/.codex-plugin/plugin.json` exposes the
Visual Stack skills to Codex; this wireframe workflow is the one with a Codex
host adapter. Install the repository marketplace, then install the plugin:

```text
codex plugin marketplace add Cavalry-Collective/visual-stack
codex plugin add vstack@cavalry-collective
```

Start a new Codex thread and invoke **`$vstack:wireframe`**, or describe a wireframe or
UI-review task and let the skill trigger implicitly.

Update detection is disabled for Codex (`updateDetect: none`); use
`codex plugin marketplace upgrade cavalry-collective` and reinstall the plugin
when testing a newer marketplace revision.

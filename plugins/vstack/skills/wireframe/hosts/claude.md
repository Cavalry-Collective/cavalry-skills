# Host adapter: Claude Code

Implements [contracts/host.md](../../../contracts/host.md) for **Claude Code**.
Profile: `plugins/vstack/hosts/claude.json` (`id: claude`).

Pass on every server command (or export once per shell):

```bash
export VSTACK_HOST=claude
# or:  --host claude
```

Default when unset is `claude`, so existing installs keep working without this.

---

## Operation map

| Host op | Claude Code tool | How |
| --- | --- | --- |
| `background(cmd)` | Bash / shell with `run_in_background: true` | `node …/review-server.mjs serve …` must outlive the turn |
| `watch_stream(cmd)` | **Monitor** tool, `persistent: true` | `node …/review-server.mjs watch --all --stream` |
| `stop(handle)` | TaskStop / stop the background task | After approve or when ending the session |
| `run(cmd)` | Bash (foreground) | `publish`, `reply`, `share`, `check`, `status` |
| `edit` | Edit / Write tools | Change the HTML file or app source |
| `share(file)` | **Artifact** tool (favicon 🎨) | Publish the wireframe file; then `share --url <url>` |
| `browser_capture` | Claude-in-Chrome / browser tools | Navigate, screenshot, run `harvest-reference.js` |

---

## Concrete start sequence

```bash
SKILL=<this skill dir>   # …/skills/wireframe
FILE=wireframes/example.html

node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version" --host claude

# background:
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host claude

# watch_stream (Monitor, persistent: true):
node "$SKILL/assets/review-server.mjs" watch --all --stream
```

Tell the user **http://localhost:7788/**.

---

## Share

On `SHARE` event or user request:

1. Publish `$FILE` with the **Artifact** tool.
2. `node "$SKILL/assets/review-server.mjs" share --file "$FILE" --url "<artifact-url>"`

Live review: publish the capture under `.vstack/wireframe/<name>/versions/v<n>.html` and say it is a still.

Offline remote comments: `bundle-artifact.mjs` — Send becomes copy (no session).

---

## Notes

- Update detection uses Claude’s install record (`capabilities.updateDetect: claude-install`).
- Skill invocation in the marketplace: `/vstack:wireframe`.

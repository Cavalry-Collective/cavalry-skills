# Host adapter: Claude Code

Implements [contracts/host.md](../../../contracts/host.md) for **Claude Code**.
Profile: `plugins/vstack/host-profiles/claude.json` (`id: claude`). That JSON is
UI data only — the op-to-tool map is this file.

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
| `watch_stream(cmd)` | **Monitor** tool, `persistent: true` | `node …/review-server.mjs watch --all --stream` — Monitor delivers each line to the session as it arrives |
| `stop(handle)` | TaskStop / stop the background task | After approve or when ending the session |
| `run(cmd)` | Bash (foreground) | `publish`, `reply`, `ack`, `share`, `check`, `status` |
| `edit` | Edit / Write tools | Change the HTML file or app source |
| `share(file)` | **Artifact** tool (favicon 🎨) | Publish the wireframe file; then `share --url <url>` |
| `browser_capture` | Claude-in-Chrome / browser tools | Navigate, screenshot, run `harvest-reference.js` |

---

## Concrete start sequence

```bash
SKILL=<this skill dir>   # …/skills/review
FILE=wireframes/example.html

node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version" --host claude

# background:
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host claude

# watch_stream (Monitor, persistent: true):
node "$SKILL/assets/review-server.mjs" watch --all --stream

# then answer the HANDSHAKE line it prints, with Bash (foreground):
node "$SKILL/assets/review-server.mjs" ack --all --token <token from that line>
```

The `HANDSHAKE` line arrives in the session as soon as Monitor has it. Answer it
with `ack`, and the watcher is live from then on.

Tell the user **http://localhost:7788/**.

---

## Share

On `SHARE` event or user request:

1. Publish `$FILE` with the **Artifact** tool.
2. `node "$SKILL/assets/review-server.mjs" share --file "$FILE" --url "<artifact-url>"`

Live review: publish the capture at `<store>/versions/v<n>.html` — `store` comes from `status` — and say it is a still.

Offline remote comments: `bundle-artifact.mjs` — Send becomes copy (no session).

---

## Notes

- Update detection uses Claude’s install record (`capabilities.updateDetect: claude-install`).
- Skill invocation in the marketplace: `/vstack:review`.

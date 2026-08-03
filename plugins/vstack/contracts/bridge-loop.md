# Contract: Bridge loop

How a session stays linked to a page served by `lib/json-bridge.mjs` — the
shared engine behind `spec`, `user-story-map` and `phase-build`. Host-independent:
each skill's SKILL.md names the host mechanism that fulfills the two roles here
(a background process for `serve`, a persistent stream for `watch`).

## The watcher

After `serve` starts (in the background — it must outlive the turn) and prints
its URL, token and seq, arm the watcher as a persistent stream:

```bash
node <lib>/json-bridge.mjs watch --json <doc.json> --stream --tool <skill> \
  --seq <the seq the server printed>
```

**It never exits.** Each line of stdout is one event, delivered as it happens,
so there is nothing to re-arm after a round — which is the step that gets
forgotten and leaves a page nobody is reading.

**Pass the seq the server printed, not a fresh read.** The stream carries its
own position from there, so a send that lands between rounds cannot be
swallowed.

| Event | Meaning | Agent action |
| --- | --- | --- |
| `WATCHING` | Stream armed | — |
| `SENT` | An edited document landed in the JSON file | Read the file back — it is the new source of truth |
| `APPROVED` | The document is signed off | Say so; carry on with what comes next |
| `CLOSED` | The tab went away; the server has exited | Say the link is closed and stop serving |

## Link states

While the watcher runs the page shows **Linked**; with no watcher it shows
**Unlinked**, in amber, so the user can see that a Send would sit there unread.

## Idle close

The page holds an SSE connection. When the last one goes away and none returns
within the grace period (`--idle-timeout`, default 90s — long enough that a
reload reconnects), the server removes its `url` file and exits. That exit ends
the watcher with `CLOSED`. `--idle-timeout 0` keeps the server up until it is
stopped explicitly.

Either way, **say when the link is closed** — the user should never have to
guess whether a socket is still open. After that the page's Send goes grey
(*Link lost*) and only the copy fallback works. Nothing is lost: the last sent
state is on disk in the JSON file.

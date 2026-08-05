# Contract: Review loop

The local protocol between (1) the **review engine** (`review-server.mjs` +
workspace), (2) the **agent session**, and (3) the **reviewer** in the browser.

Host-independent: any Host that fulfills [host.md](host.md) can drive this loop.

---

## Participants

| Role | Responsibility |
| --- | --- |
| **Engine** | Serves workspace, stores state, freezes versions, emits events |
| **Agent** | Applies feedback, publishes versions, replies, fulfills Host ops |
| **Reviewer** | Comments in the browser; Send / Approve / Share |

---

## Subject under review

| Mode | Identity | What a round changes |
| --- | --- | --- |
| **File** | `--file <page.html>` | That HTML file |
| **Live** | `--app <url>` + `--name <slug>` | App source (or notes for a third-party site) |

---

## On-disk store

Beside the file: `<dir>/.vstack/local/review/<name>/`
Live (no file): `<cwd>/.vstack/local/review/<name>/`

`review/` is where a store is **created**. An implementation must also **read**
`<dir>/.vstack/local/wireframe/<name>/`, which is where stores made before this
tool was renamed still are — first directory holding the subject wins, and a
subject present in both is read from `review/`. Nothing is migrated: a user's
rounds stay where they were written. `status` reports the resolved `store`, so
a caller never has to pick between the two itself.

| Path | Role |
| --- | --- |
| `state.json` | `{ name, version, app?, … }` |
| `versions/v<n>.html` | Frozen file or DOM capture |
| `versions/v<n>.meta.json` | Label, date, addressed ids |
| `reviews/v<n>/annotations.json` | Live comments + threads |
| `reviews/v<n>/feedback.md` | Markdown brief for the agent |
| `reviews/v<n>/feedback.json` | Same, structured |
| `rounds/r<n>.json` | Durable membership, revisions, outcomes, and completion record |
| `handshake` | A stream watcher waiting to be told its events are being read |
| `pending` | Notification only: review sent, agent must `claim` it |
| `approved` | Sentinel: design signed off; engine shutting down |
| `share` | Sentinel: reviewer wants a shareable link |
| `url` | Present only while `serve` is running |
| `watching` | Heartbeat while Host op `watch_stream` is active |

Every vstack tool keeps its per-machine working files under
`.vstack/local/<tool>/`, resolved by `lib/workdir.mjs`: the enclosing `.vstack`
when the artifact already sits in one, otherwise the one beside it. Engines must
go through that helper rather than joining the path themselves. `local/` is
gitignored whole; the rest of `.vstack/` is the pipeline and is committed.

---

## Thread roles (on disk)

```ts
type ReplyBy = "agent" | "reviewer"
// Legacy reads: "claude" MUST be treated as "agent"
```

Writers always use `"agent"`. Readers accept both `"agent"` and `"claude"`.

CSS/UI may use class `agent`; class `claude` remains a synonym for old markup.

---

## CLI surface

All commands: `node review-server.mjs <cmd> …`
Host selection: `--host <id>` or `VSTACK_HOST=<id>` (affects UI injection only).

| Command | Contract |
| --- | --- |
| `serve --file …` / `serve --app …` | Long-lived via Host `background`. Binds `127.0.0.1`. |
| `ack --file/name … --token <token>` \| `ack --all --token <token>` | Answer a stream watcher's handshake. Only this arms the `watching` heartbeat |
| `claim --file/name … --round r<n>` | Acknowledge delivery while preserving the durable round ledger |
| `publish --file/name … --round r<n> --label … [--addressed ids]` | Validate full round coverage, freeze next version, and mark comments addressed |
| `reply --file/name … --round r<n> --comment <id> --text "…"` | Append `{ by: "agent", text, at }`; status → `question` |
| `share --file/name … --url <url>` | Record public URL; clear `share` sentinel |
| `check --file/name …` | Always exits `0`. Names a queued round nobody has claimed |
| `status --file/name …` | Human/debug snapshot |
| `watch [--all] [--file …] --stream` | Event stream via Host `watch_stream` |

---

## Stream events

One line of stdout per event (from `watch --stream`):

| Prefix | Meaning | Agent action |
| --- | --- | --- |
| `WATCHING` | Stream armed | — |
| `HANDSHAKE` | The watcher asking whether anyone receives it | Run the `ack` command it prints, immediately |
| `LINKED` | The handshake was answered | — |
| `UNWIRED` | The handshake went unanswered; the watcher exits `3` | Start it again via `watch_stream` |
| `REVIEW` | `pending` written; round id and path to `feedback.md` | `claim` the round, apply brief, publish/reply |
| `REPLIED` | Reviewer answered a question | Continue that comment’s thread |
| `SHARE` | Link requested | Host `share` if capable; then `share --url` |
| `APPROVED` | Sign-off; server exiting | Confirm; next pipeline stage as skill says |
| `OPENED` | Another live store joined `--all` | — |
| `CLOSED` | Tab/store gone | Drop; exit when none left |

---

## Round protocol

```
serve (background) + watch_stream
        │
        ▼
reviewer comments ──Send──► round record + pending + feedback.md
        │                         │
        │                    REVIEW event
        │                         ▼
        │              agent: claim · apply · reply/check · publish
        │                         │
        │◄──── version ready ─────┘
        │
 Approve ──► approved ──► APPROVED + server exit
  Share ──► share ──► SHARE ──► share --url
```

Rules:

1. Only a validated `publish --round … --addressed …` closes comments (reviewer has no resolve).
2. The engine rejects publication unless every round member is addressed, dismissed, or waiting on the reviewer.
3. The engine rejects unknown IDs, changed comment revisions, unclaimed rounds, and stale round IDs.
4. A round in flight cannot be called off. The reviewer's only correction is to send again, which supersedes the brief. Do not delete protocol files manually.
5. Retrying an already completed `publish --round …` is idempotent and creates no extra version.
6. One `watch_stream` per session is enough with `--all`.
7. Presence is proven. A stream watcher writes its `watching` heartbeat from the moment its handshake is answered, so **Linked** means a session is receiving the stream. Default window 120 s (`--handshake-timeout <seconds>`).
8. Presence is also claim-backed. The engine reports the agent present (workspace **Linked**) only while the `watching` heartbeat is fresh **and** no queued round has sat unclaimed past the claim window (90 s). A stalled round drops presence — a watcher whose events nobody reads must look the same to the reviewer as no watcher at all.

---

## Feedback brief

`feedback.md` + `feedback.json` carry at least:

| Field | Meaning |
| --- | --- |
| `id` | Pass to `--addressed` |
| `note` | Requirement text |
| `anchor` | Element identity (tag, id, classes, text, region, selector) |
| `screenSize` | Layout the comment was made at |
| `route` | Live only — app path |
| `status` | `open` · `question` · `addressed` |
| `replies` | `{ by, text, at }[]` |
| `reopened` / `wantsRevert` | Returned from Refine / Revert |

---

## Share

- **File review:** subject file (self-contained HTML) is what gets a public URL.
- **Live review:** a DOM capture for the current round; agent must say it is a still.
- Offline bundle (`bundle-artifact.mjs`): no session; Send becomes copy-to-clipboard.

---

## Non-goals of this contract

- How the Host names its tools (see Host adapters).
- Pipeline / `.vstack/pipeline.json` (skill handoff, not the review engine).
- Marketplace install paths (Host profile `install` + `updateDetect` only).

# Changelog

What changed in each release of Visual Stack, newest first. Versions follow
[semantic versioning](https://semver.org). Full notes for each release are on
the [releases page](https://github.com/Cavalry-Collective/visual-stack/releases).

The version in `plugins/vstack/.claude-plugin/plugin.json` is what your host
compares against to decide an update is available. See the release checklist in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## 4.9.0 — 2026-08-05

- **Two new ways to mark up a page: Move and Delete.** A toolbar beside the page
  holds Comment, Move and Delete — what Annotate draws with, on keys `c`, `m`
  and `d`. Neither new tool needs a note: the mark is the instruction, and
  anything you type adds to it. Both outline whatever the pointer is over, so
  the element the gesture will take is settled before you press.
  - **Move** draws an arrow from a thing to where it should go. It records the
    element you dropped it on and which side of it — inside, before, or after —
    so your agent is told "after the Cancel button" rather than "180px right",
    which stops meaning anything the moment the page reflows.
  - **Delete** strikes out what should go. Drag across text and exactly those
    words are marked for removal; the strike finds them again by their text when
    the page is rebuilt, so it stays on them. Click an element instead and the
    whole thing is marked.
- **A watcher finds a review whose page lives outside the directory it was
  started from.** A review's files sit beside the page under review, and
  `watch --all` found them by walking the directory it ran in. A page written to
  a temp directory took its files with it, so the watcher walked straight past a
  running review and the workspace said Unlinked while a session was in fact
  listening. Serving now leaves a pointer where it was run from, and the watcher
  follows it.
- **A watcher that covers no review says so.** It reports `UNLINKED` instead of
  `LINKED`, because nothing is listening to any workspace at that point whatever
  the handshake proved. A handshake also carries the token it printed, so one
  watcher's answer no longer brings a different watcher live.

## 4.8.1 — 2026-08-05

- **The comment composer's send button is readable in dark mode.** Its label was
  fixed to white while its background follows `--ink`, which is the text colour
  and therefore near-white under a dark theme. The button rendered as a blank
  white box, at a contrast of 1.12:1. The label now follows `--surface`, the
  pairing the rest of the interface already uses, giving 15.70:1 in dark and
  leaving light mode exactly as it was.

## 4.8.0 — 2026-08-04

- **The plugin declares a version.** Until now it shipped without one, so every
  commit to `main` counted as a release. Your host now compares version numbers
  and updates when this number changes. A copy installed before this release has
  no version on record and keeps comparing commits until it updates once.
- **A comment lands on the element it was left on, not a lookalike.** The
  selector recorded for a comment was cut off after eight steps, and a short
  path can first-match a different element elsewhere on the page, which is the
  one `querySelector` returns. The recorded selector is now the shortest one
  that matches a single element, and a path still ambiguous at full length is
  rooted at `body` so the chain is exact.
- **Reanchoring prefers the element carrying the comment's words.** When a
  selector still parses but its match shares nothing with what was captured, an
  element scoring on text or identity is now taken ahead of it.
- Both host manifests carry the full set of distribution metadata: version,
  display name, homepage, repository, license, and keywords covering what
  someone would search for. Descriptions across all three manifests are drawn
  from the README.
- CI runs the tests on Node 18 and 22, checks the stamped shell for drift, and
  validates both manifests with the same tool the community-marketplace review
  pipeline runs. A release workflow rejects a tag that disagrees with the
  manifest version.
- Issue and pull request templates, a changelog, and a release procedure in
  `CONTRIBUTING.md`.

## 4.7.0 — 2026-08-04

- A question the agent asks is carried onto the next version and drawn in the
  comments list, with a reply box already open. Carried questions were counted
  everywhere but had no card, so there was no way to answer or dismiss one.
- A carried card says which version raised it, as `from r3` in a live app review
  and `from v3` in a wireframe review.
- The walk over earlier versions sorts explicitly, rather than relying on
  integer-like object keys happening to iterate in order.

## 4.6.0 — 2026-08-04

- **The wireframe tool is now `/vstack:review`.** `/vstack:wireframe` still works
  as a thin alias. Rounds already under `.vstack/local/wireframe/` keep working,
  and nothing is migrated behind your back.
- **Three ways a comment could go missing, fixed.** A save no longer deletes
  comments it did not mention, a reply lands in the version the workspace has
  open, and a question survives the next publication.
- The project-planning tools (spec, start, phase-build, phase-preview, and the
  `go` alias) move to `experimental/`, where no host discovers them. `review` and
  `user-story-map` are what ships.
- Comments anchor to what you clicked on a page that scrolls its own window.
- Addressed comments read green across the mark, the card, and the composer.
- One live-link client and one heartbeat protocol shared by the review server
  and the JSON bridge.

## 4.5.0 — 2026-08-03

- Machine state and pipeline state split first, tool name second. Everything
  per-machine lives under `.vstack/local/<tool>/`, gitignored by one line.
  `pipeline.json`, `specs/`, and `build/` stay tracked.
- The JSON bridge takes `--tool`, so the skills that share it get their own
  directories.

## 4.4.0 — 2026-08-03

- The tools stop scattering dot-directories. `.ui-review/<name>/` and
  `.vstack-bridge/` move under `.vstack/`.
- **Breaking:** reviews in flight under `.ui-review/`, and comment drafts under
  the `ui-review:*` `localStorage` keys, are orphaned. There is no migration.
  Finish or discard any open review before updating.

## 4.3.0 — 2026-08-03

- **Codex host.** Install from the Codex marketplace and invoke `$wireframe` to
  build or review a UI in the annotation workspace.
- `hosts/codex.json` carries Codex's labels, capabilities, and update commands.
  Skills still depend only on the contract, never on a particular agent product.
- Clearing a review opens a confirm dialog that says how many comments go.
- The comments panel becomes its own full-width view below 720px.
- Merging server state no longer undoes a local dismissal, reply, or reopen that
  is still inside the autosave window.

## 4.2.0 — 2026-08-01

- **Shared shell.** One top bar, palette, theme, and scrubber for every tool page.
- **Live wireframe review.** Point the workspace at a localhost app or a public
  site and it proxies the real screens, so comments land on them.
- **`/vstack:phase-preview`** (was `phase-wireframe`).
- Each local server checks once whether the plugin has moved on, and shows one
  dismissable line when it has. Opt out with `VSTACK_NO_UPDATE_CHECK=1`.

## 4.1.0 — 2026-07-30

- **Visual Stack.** A name, a mark, and three new skills: `/vstack:go`,
  `/vstack:spec`, and `/vstack:phase-build`.
- `/vstack:init` becomes `/vstack:start`, and now also sets up a design-only
  workspace or connects an existing codebase without touching it.

## 2.0.0 — 2026-07-28

- **Breaking:** `/cavalry:ui-review` becomes `/cavalry:wireframe`.
- Adds `init` and `phase-wireframe`.
- Approve and cancel from the workspace. Publishing a shareable link publishes
  the design rather than the review workspace.

## 1.1.0 — 2026-07-27

- Adds the **ui-review** skill: annotate on the page itself, with severity,
  threaded replies, viewport switching, and a version timeline.
- Both skills get a live link back to the agent session, so feedback returns
  without copy-paste.

## 1.0.0 — 2026-07-27

- First release, shipping the **user-story-map** skill: journey activities as
  columns, release phases as rows, stories as drag-and-drop cards.

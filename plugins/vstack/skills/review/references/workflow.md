# Workflow reference

`$SKILL` = the directory holding `SKILL.md`. `$FILE` = the HTML file under review.
For a live review of a running app, `--app <url>` replaces `--file` on `serve`,
and `--name <slug>` replaces it on every other command.

## Layout

The review is one file. Everything the loop needs sits beside it, out of the
way:

```
wireframes/
  candidate-pipeline.html        ← the page — the ONLY file you edit
  .vstack/local/review/
    candidate-pipeline/
      state.json                 { name, version }
      versions/v1.html           frozen copy of each published version
      versions/v1.meta.json      label, date, which ids it answered
      reviews/v1/
        annotations.json         live workspace state (autosaved while reviewing)
        feedback.md              the brief you read
        feedback.json            the same, structured
      rounds/r1.json             durable membership, revisions and outcomes
      pending                    notification — written on send, cleared by claim
      handshake                  a stream watcher waiting to be told its events land
      approved                   sentinel — signed off; the review is over
      share                      sentinel — they want a shareable Artifact link
      url                        the live URL — exists only while serving
```

`.vstack/local/` is where every vstack tool keeps its per-machine working files,
one directory per tool, so a project grows one dot-directory rather than one per
engine — and one gitignore line covers all of them. The review store sits beside
the page, so moving the page moves its review with it.

A live review has no file to sit beside, so its store is
`.vstack/local/review/<name>/`
under the directory `serve` was run from, and `state.json` also carries the app's
origin. `versions/v<n>.html` is then a capture of the screen the reviewer was
commenting on when they sent round *n* — the timeline scrubs to it, and it is
what `share` publishes. A round nobody sent a review from has no capture, which
the workspace says in the frame rather than showing an error.

`pending`, `approved` and `share` are the three ways the workspace reaches you.
Approving clears `pending`, and `serve` clears `approved` and `share` at startup.
Do not delete protocol files manually: `claim` clears `pending` and `share --url`
clears `share`. The round record remains as the validation and recovery ledger.

## Commands

```bash
# freeze the file as the next version and make it current
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version"
node "$SKILL/assets/review-server.mjs" claim --file "$FILE" --round r1
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" \
  --round r1 --label "Filters collapsed" --addressed c1f3k2,c9dk1

# ask about a comment instead of guessing — the question lands on the mark
node "$SKILL/assets/review-server.mjs" reply --file "$FILE" \
  --round r1 --comment c7f2a1 --text "Every overdue row, or only the ones assigned to you?"

# serve (Host op background) — opens the workspace in the browser, closes itself 90s after the tab does
# --host / VSTACK_HOST selects UI labels (claude | codex | grok); see contracts/host.md
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788 --host "$VSTACK_HOST"
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --idle-timeout 0 --host "$VSTACK_HOST"  # stay up until stopped
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --no-open                               # leave the browser alone

# answer a stream watcher's handshake — until this lands it claims no presence
node "$SKILL/assets/review-server.mjs" ack --all --token 7f3a91

# hand back a public URL when Host capabilities.share is artifact
node "$SKILL/assets/review-server.mjs" share --file "$FILE" --url "https://example.com/…"

# where are we — current version, a waiting review, a sign-off, a share request
node "$SKILL/assets/review-server.mjs" status --file "$FILE"

# shareable single file
node "$SKILL/assets/bundle-artifact.mjs" --file "$FILE" --out review.html
```

### Live review of a running app

```bash
# proxy the app and serve the workspace at /__review/ (run_in_background: true)
node "$SKILL/assets/review-server.mjs" serve --app http://localhost:5173 --name lora-ui --port 7788
node "$SKILL/assets/review-server.mjs" serve --app :5173 --name lora-ui --start /workflows

# every other command names the review instead of a file
node "$SKILL/assets/review-server.mjs" claim   --name lora-ui --round r1
node "$SKILL/assets/review-server.mjs" publish --name lora-ui --round r1 --label "Date column added" --addressed c1f3k2
node "$SKILL/assets/review-server.mjs" reply   --name lora-ui --round r1 --comment c7f2a1 --text "Created, or finished?"
node "$SKILL/assets/review-server.mjs" status  --name lora-ui
node "$SKILL/assets/review-server.mjs" check   --name lora-ui
```

`--name` finds the store under the current directory — run every command from
where `serve` was run, or pass `--store <dir>`. Without `--name` the store is
named after the host and port (`localhost-5173`).

The workspace is at **`/__review/`**, not `/`: the app owns the root path space
so its own absolute URLs resolve unchanged. `X-Frame-Options` and
`Content-Security-Policy` are stripped from proxied responses (they exist to stop
framing, which is exactly what the workspace does), redirects back to the app's
origin are rewritten to stay inside the proxy, and WebSocket upgrades are passed
through so hot reload survives.

`publish` always creates v(current + 1) and makes it current, so the version the
workspace names always has a frozen copy behind it. The rhythm is: edit the
file → `publish` → the workspace offers the reviewer the new version.

`--replace` overwrites the current version instead of creating a new one — for
fixing up a version nobody has reviewed yet.

`serve` publishes v1 automatically if nothing has been published.

The timeline's **Clear history** action keeps the current frozen version and its
number, then deletes every earlier snapshot. Comments stay intact and use the
separate **Clear all** action in the comments panel.

## Catching a review

```bash
node review-server.mjs watch --all --stream        # or --file <page.html>
```

Run it with Host op **`watch_stream`** (adapter names the tool). One line of
stdout is one event and the process never exits, so there is nothing to restart
between rounds:

```text
WATCHING  2 review(s): wireframe, spec-tree
HANDSHAKE this stream is not live until you answer it. Run now:
          node …/review-server.mjs ack --all --token 7f3a91
LINKED    handshake answered — the workspace says Linked from here
REVIEW    wireframe · r17 · 3 comment(s) · …/reviews/v12/feedback.md
REPLIED   wireframe · v12/c7h0zh0 · "let's align it to the bottom"
OPENED    story-map-template · now watching 3 review(s)
CLOSED    spec-tree · the tab went away
```

`--all` covers every review with a live server under the project, including ones
opened after the watcher started; `--file` can be repeated, and combines with
`--all` for a page living outside the project. While it runs each page shows
**Linked**; with no watcher they show **Unlinked**, in amber.

**Linked** also needs the rounds to move: a round left unclaimed for 90 seconds
flips the page back to **Unlinked** and marks the sent comments "not picked up
yet". If that happens while your watcher is running, its events are not reaching
you — check how it was started against the Host adapter, then claim the round.

First thing after a `REVIEW`: run `claim --round <id>` using the id in the event.
It clears the notification but preserves the durable ledger. Use `share --url`
after publishing a link.

A one-shot form (`watch` without `--stream`) still exists: it exits on the first
event and prints the command to restart itself. Nothing points at it any more —
it is there for scripting, not for the loop.

**Answer the handshake.** The stream opens by asking whether anyone receives it,
because nothing in the process can tell which tool started it. The heartbeat
starts when `ack` lands and the page says Linked from then on. Answer within two
minutes (`--handshake-timeout <seconds>`), or the watcher prints `UNWIRED` and
exits `3`.

**Arm exactly one waiter per review.** Re-arming without stopping the previous
one leaves loops polling paths that no longer exist.

## Reading the feedback

`feedback.md` is a brief grouped by screen size; the fenced JSON block at the
bottom is the same data structured. Each comment:

| field | meaning |
|---|---|
| `id` | pass back via `--addressed` once handled |
| `kind` | `comment` (a point) or `area` (a region) |
| `note` | the reviewer's words — the actual requirement. **Every comment is a must**; there is no severity to triage by |
| `anchor` | the element the comment was made on: `tag`, `id`, `classes`, `role`, `text`, `label`, the `region` it sits in, and the `selector` that found it |
| `covers` | area comments only — every named element the box was drawn around, in page order |
| `anchorText` | the words on screen under the mark — the short form of `anchor.text` |
| `screenSize` | `ultrawide` / `desktop` / `tablet` / `phone` — the layout it was made at |
| `route` | live review only — the screen of the app it was made on. The way back to it, and half the answer to which component renders it |
| `point` / `rect` | where, in the page's own coordinates at that size |
| `status` | `open` (yours to act on) · `question` (you asked, waiting on them) · `addressed` |
| `replies` | the thread so far — `{by: 'agent' \| 'reviewer', text, at}` (legacy: `'claude'` = agent) |
| `reopened` | you closed this once and it came back — read it again before touching anything |
| `wantsRevert` | undo what you did here first; the note stands only if it still makes sense afterwards |
| `fromVersion` | earlier than the current version = it was already asked once |

A comment is attached to an element, not to a coordinate. `anchor` is what it
was made on and where that sits — read it first, and use the coordinates only to
break a tie. For an area comment `anchor` is the element that contains the whole
box and `covers` is what was inside it: "needs a date column" drawn over a list
arrives with the rows it was drawn over, so the scope is read, not guessed. A
trailing `…` in the brief's **Covers** line means the box held more than ten
named things. `anchor.region` is the part of the page it lives in, which is often
the whole answer: a comment `inside dialog “Add a role”` is about that modal,
whatever the numbers say. When `anchor` is null the mark landed on blank space,
which is usually itself the point ("this gap is too big").

`anchor.selector` is how the workspace finds the element again to keep the mark
on it — a hint, not a contract. **Keep ids and distinctive classes stable when
you rewrite the page.** Change them and open comments lose their grip: they fall
back to the coordinates they were drawn at and the reviewer sees a faded mark
instead of one sitting on the thing they meant.

The workspace only draws a mark when its element is actually on screen. A
comment made inside a modal, a tab or a step is not shown while that thing is
closed — it is still in the list, tagged *not on screen*, and it still reaches
you. So do not read "no mark visible" as "withdrawn".

`screenSize` matters: a comment made at `phone` is about the phone layout, not
the desktop one.

## The conversation

The reviewer has no resolve button — a validated
`publish --round <id> --addressed <ids>` is the only thing that closes a comment out. The command
fails without creating a version when any round member is left open, an id or
revision is stale, or the round was not claimed.
They can delete a comment or clear the lot, but they cannot mark one done.
Emptying a comment's text deletes it, so an empty comment never reaches you.

What they *can* do is send one back. Addressed comments stay in their list under
their own heading with **Revert** and **Refine** beside them; either reopens the
comment and returns it next round, revert with a reply asking for the change to
be undone. That is the only path by which a status goes backwards — the server
refuses an un-address from a client unless the annotation carries the
`reopenedAt` stamp those two buttons write.

Send is one click with no preview, and greys out until a comment is added,
edited or answered — so a review landing on your waiter always contains
something new.

When a comment is ambiguous, `reply` beats guessing. The question renders on the
mark itself, the comment shows as *{agent} asked*, and their answer flips it back
to open and arrives in the next brief under the thread. Replies also work for
pushing back: say why something is wrong for the design rather than silently
ignoring it.

The workspace merges replies live, so a question you post appears without the
reviewer reloading anything.

## Troubleshooting

**Workspace says it can't reach the server.** Either the tab was closed long
enough for the server to close itself (that's by design — start it again), or
the process died. Check the background task output.

**`EADDRINUSE`.** Another review server holds the port — reuse it, or
`--port 7789`.

**The review is named wrong.** The name comes from the page's `<title>`.
Give the file a real title; the filename is the fallback.

**The page renders oddly at full height.** The document lays out at its full
content height inside the window's scroller, which is what keeps comment
coordinates pinned to the content. `body { overflow: hidden }` or
`height: 100vh` fights that — use `min-height: 100vh`.

**The workspace is in the wrong language.** The EN / 中文 toggle is workspace
chrome only and persists per browser. Comments and the brief keep the words they
were written in.

**Comments vanished.** Local mode stores them per version in
`reviews/v<n>/annotations.json` — scrubbing to an older version shows that
version's comments, read-only. Comments also only render at the screen size
they were made at; the panel lists the others under "On other screen sizes".

**Bundle is huge.** `--versions 1` keeps only the newest published version.

**Live: the frame says it can't reach the app.** The app is not running, or died.
Start it and hit reload in the window bar — the review stays open either way.

**Live: the app loads but its data doesn't.** The app is calling an API on
another origin that only allows its own. Through the proxy the browser's origin
is `localhost:<review-port>`, so that call is refused. If the app proxies its own
API (the usual dev-server setup) this never happens. When it does, say so — do
not loosen the app's CORS to make a review work unless the user asks.

**Live: comments all say "another screen".** The app changed route and the marks
went with it, which is the design. Click a comment to go back to where it was
made, or check that the route in the address bar is the one you expect.

**Live: `--name` finds nothing.** The store is resolved from the current
directory. Run the command where `serve` was run, or pass `--store`.

**A public site.** Same command with a real URL. Text responses are rewritten so
the site's own absolute links stay inside the proxy, HSTS is stripped, cookies
lose their `Domain` so a session survives on localhost, `Origin`/`Referer` are
sent as the site's own, and service-worker registration is refused so a site
cannot take over the origin the workspace lives on.

- **Redirects at the front door.** If the target redirects to another origin —
  usually the `www` host — the server prints the URL to use instead. Use it;
  everything past that redirect is outside the proxy.
- **Off-site links.** The frame leaves the proxy and the workspace says *off-site*
  in the address bar. Nothing on another origin can be read or annotated. Back
  returns.
- **A site that won't load.** Bot protection, an interstitial or a rate limit.
  That is the site's answer — report it rather than working around it.
- **Reads work, writes may not.** A hardened site can still refuse a POST whose
  CSRF token was minted for its own origin.

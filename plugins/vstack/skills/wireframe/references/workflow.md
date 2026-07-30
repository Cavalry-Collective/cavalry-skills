# Workflow reference

`$SKILL` = the directory holding `SKILL.md`. `$FILE` = the HTML file under review.

## Layout

The review is one file. Everything the loop needs sits beside it, out of the
way:

```
wireframes/
  candidate-pipeline.html        ← the page — the ONLY file you edit
  .ui-review/
    candidate-pipeline/
      state.json                 { name, version }
      versions/v1.html           frozen copy of each published version
      versions/v1.meta.json      label, date, which ids it answered
      reviews/v1/
        annotations.json         live workspace state (autosaved while reviewing)
        feedback.md              the brief you read
        feedback.json            the same, structured
      pending                    sentinel — written on send, deleted by you
      cancel                     sentinel — the reviewer called this round off
      approved                   sentinel — signed off; the review is over
      share                      sentinel — they want a shareable Artifact link
      url                        the live URL — exists only while serving
```

`pending`, `cancel`, `approved` and `share` are the four ways the workspace
reaches you, and only one is ever meaningful at a time: sending clears `cancel`,
cancelling clears `pending`, approving clears both, publishing clears `cancel`,
and `serve` clears `cancel`, `approved` and `share` at startup so a new review
never fires on an old verdict. You delete `pending` and `cancel` once you have
acted on them; `share --url` clears `share` for you.

## Commands

```bash
# freeze the file as the next version and make it current
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version"
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" \
  --label "Filters collapsed" --addressed c1f3k2,c9dk1

# ask about a comment instead of guessing — the question lands on the mark
node "$SKILL/assets/review-server.mjs" reply --file "$FILE" \
  --comment c7f2a1 --text "Every overdue row, or only the ones assigned to you?" 

# serve (run_in_background: true) — closes itself 90s after the tab does
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --idle-timeout 0   # stay up until stopped

# hand back the published Artifact URL — it appears under the ▾ in the workspace
node "$SKILL/assets/review-server.mjs" share --file "$FILE" --url "https://claude.ai/public/artifacts/…"

# where are we — current version, a waiting review, a cancel, a sign-off, a share request
node "$SKILL/assets/review-server.mjs" status --file "$FILE"

# shareable single file
node "$SKILL/assets/bundle-artifact.mjs" --file "$FILE" --out review.html
```

`publish` always creates v(current + 1) and makes it current, so the version the
workspace names always has a frozen copy behind it. The rhythm is: edit the
file → `publish` → the workspace offers the reviewer the new version.

`--replace` overwrites the current version instead of creating a new one — for
fixing up a version nobody has reviewed yet.

`serve` publishes v1 automatically if nothing has been published.

## Catching a review

```bash
STORE="$(dirname "$FILE")/.ui-review/$(basename "$FILE" .html)"
until [ -f "$STORE/pending" ] || [ -f "$STORE/approved" ] || [ -f "$STORE/cancel" ] \
   || [ -f "$STORE/share" ] || [ ! -f "$STORE/url" ]; do sleep 2; done
if   [ -f "$STORE/approved" ]; then echo "APPROVED";  cat "$STORE/approved"
elif [ -f "$STORE/cancel" ];   then echo "CANCELLED"; cat "$STORE/cancel"
elif [ -f "$STORE/share" ];    then echo "SHARE";     cat "$STORE/share"
elif [ -f "$STORE/pending" ];  then cat "$STORE/pending"
else echo "review closed"; fi
```

Run with `run_in_background: true`. It ends when the user hits **Send to
Claude**, **Approve**, **Cancel** or **Publish a link to this wireframe**, or when they close the tab and the server
shuts itself down — the `url` file exists only while the server is listening, so
the loop can never outlive the review. Test the sentinels before falling through
to `review closed`: approve closes the server too, so a waiter that only watches
`url` reports a signed-off design as an abandoned tab. First thing after waking
on a review: delete `pending`.

**Cancel is a request, not a kill.** Nothing can reach into a turn you are
already running — the sentinel is how the reviewer says *stop*, and you answer
for whatever you had already changed. If you are working a long round, check for
`$STORE/cancel` before you publish.

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
| `point` / `rect` | where, in the page's own coordinates at that size |
| `status` | `open` (yours to act on) · `question` (you asked, waiting on them) · `addressed` |
| `replies` | the thread so far — `{by: 'claude' \| 'reviewer', text, at}` |
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

The reviewer has no resolve button — `publish --addressed <ids>` is the only
thing that closes a comment out, so anything you skip comes back next round.
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
mark itself, the comment shows as *Claude asked*, and their answer flips it back
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

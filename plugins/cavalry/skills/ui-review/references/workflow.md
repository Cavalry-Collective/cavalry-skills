# Workflow reference

`$SKILL` = the directory holding `SKILL.md`. `$FILE` = the HTML file under review.

## Layout

The review is one file. Everything the loop needs sits beside it, out of the
way:

```
mockups/
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
```

## Commands

```bash
# freeze the file as the next version and make it current
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version"
node "$SKILL/assets/review-server.mjs" publish --file "$FILE" \
  --label "Filters collapsed" --addressed c1f3k2,c9dk1

# ask about a comment instead of guessing — the question lands on the mark
node "$SKILL/assets/review-server.mjs" reply --file "$FILE" \
  --comment c7f2a1 --text "Every overdue row, or only the ones assigned to you?" 

# serve (run_in_background: true)
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788

# where are we
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
until [ -f "$STORE/pending" ]; do sleep 3; done; cat "$STORE/pending"
```

Run with `run_in_background: true`. It exits when the user hits **Send to
Claude**, which re-invokes you. First thing after waking: delete `pending`.

## Reading the feedback

`feedback.md` is a brief grouped by screen size; the fenced JSON block at the
bottom is the same data structured. Each comment:

| field | meaning |
|---|---|
| `id` | pass back via `--addressed` once handled |
| `kind` | `comment` (a point) or `area` (a region) |
| `severity` | `must` → `should` → `nice`, work in that order |
| `note` | the reviewer's words — the actual requirement |
| `anchorText` | the words on screen under the mark — how you locate it |
| `screenSize` | `ultrawide` / `desktop` / `tablet` / `phone` — the layout it was made at |
| `point` / `rect` | where, in the page's own coordinates at that size |
| `status` | `open` (yours to act on) · `question` (you asked, waiting on them) · `addressed` |
| `replies` | the thread so far — `{by: 'claude' \| 'reviewer', text, at}` |
| `fromVersion` | earlier than the current version = it was already asked once |

There are deliberately **no CSS selectors** anywhere. A comment is a place, some
words, and what it is sitting on — locate it from `anchorText` plus the
coordinates, the way a person reading a marked-up screenshot would. If
`anchorText` is empty the mark landed on blank space, which is usually itself
the point ("this gap is too big").

`screenSize` matters: a comment made at `phone` is about the phone layout, not
the desktop one.

## The conversation

The reviewer has no resolve button — `publish --addressed <ids>` is the only
thing that closes a comment out, so anything you skip comes back next round.
They can delete a comment or clear the lot, but they cannot mark one done.
Emptying a comment's text deletes it, so an empty comment never reaches you.

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

**Workspace says it can't reach the server.** The background `serve` process
died or was never started. Check the background task output; restart it.

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

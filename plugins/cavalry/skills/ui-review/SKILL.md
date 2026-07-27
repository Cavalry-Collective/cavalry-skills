---
name: ui-review
description: Open any HTML UI in an interactive review workspace where the user comments directly on the page, and turn those comments into structured instructions for the next iteration. Use when the user wants a UI mockup, wireframe, screen design or prototype built; wants to review, annotate, mark up or comment on a page or design; wants to iterate on a UI; or wants to compare versions of a screen.
---

A two-way review loop over one HTML file. The user comments on the page; you apply the comments, ask about anything ambiguous, and publish the next version. It works on a mockup you just generated, an exported screen, a prototype — anything that is a self-contained HTML page.

```
requirements ──► page.html ──► review workspace ──► feedback.md ──┐
      ▲                        (user comments)                     │
      └──────── you apply it, reply, publish v(N+1) ◄──────────────┘
```

**One review is one HTML file.** The workspace opens that file and nothing else. Several screens means several files and several workspaces — don't invent a project structure.

## 1 · If you are generating the page

Skip to §3 if the file already exists.

Establish before building — ask only what you genuinely can't infer, in one message:

- **What screen**, and what the user is trying to do on it.
- **Which screen size leads** — the workspace offers ultrawide (2560), desktop (1440), tablet (834) and phone (390).
- **Visual reference** — a website to match, or the project's design system (see §2).
- **States** — which loading / empty / error states matter enough to be shown.

Keep the first pass deliberately lean. The review loop is how it gets rich; a bloated v1 wastes the user's first review on deletions.

## 2 · Resolve the design source

In priority order — see `references/design-sources.md` for the detail:

1. **A reference site the user names** — open it with the Chrome tools, screenshot it, and extract the real palette / type scale / spacing / radii / component shapes.
2. **Reference screenshots the user provides** — read them and derive the same.
3. **The project's design system** — a `design/` folder with `tokens.css` (+ often `design-guide.html`, `CLAUDE.md`). Use its tokens verbatim. **If it ships its own principles doc, read it and follow it — it outranks the defaults below.**
4. Nothing found → ask, don't invent silently.

Default principles, unless the design source overrides them:

- **Start simple.** The minimum UI that serves the task.
- **Follow the patterns users already know** from established tools in the domain. Novelty needs a defensible reason.
- **Growing collections are datagrids** — search, sort, filters in the headers, pagination — not card walls.
- **Order by attention, place by belonging.** What the user needs first goes first; metrics last.
- **Realistic data.** Causally consistent, credible scale, real edge cases. Never a fake zero — undefined is an em dash.
- **No commentary**, **no dead controls.**

Requirements the workspace places on the file:

- **Self-contained** — tokens inline in `:root`, no external fonts, stylesheets or scripts. The same file has to work served over http *and* inlined into an Artifact bundle.
- **A real `<title>`** — the review is named after it.
- **`min-height: 100vh`, never `height: 100vh` or `overflow: hidden` on `body`** — the page lays out at full height inside the workspace's window.

## 3 · Publish and serve

```bash
SKILL=<this skill dir>          # the directory containing this SKILL.md
FILE=mockups/candidate-pipeline.html

node "$SKILL/assets/review-server.mjs" publish --file "$FILE" --label "Initial version"
```

Start the server **with `run_in_background: true`** (it must outlive the turn):

```bash
node "$SKILL/assets/review-server.mjs" serve --file "$FILE" --port 7788
```

Tell the user to open **http://localhost:7788/**, then arm the waiter (§5).

## 4 · What the user gets

The page opens in **its own browser window** on the canvas — own viewport, own scrollbar — so nothing about the workspace bleeds into the design being judged.

| | |
|---|---|
| **View / Annotate** | two modes, **space** toggles. **View hides every annotation** so the page is judged as it really is; Annotate brings them back |
| **Click** | a comment pin at that spot |
| **Drag** | an area comment over that region |
| Either way | the note opens **on the canvas** where the mark is, defaulting to **must**. A comment with nothing typed in it is discarded on dismiss |
| Captions | stay hidden — a mark shows its note when it's open, or on hover in Annotate |
| **Screen size** | ultrawide · desktop · tablet · phone. A comment belongs to the size it was made at and only shows there |
| **Thread** | your replies appear on the comment itself; they answer underneath |
| **Timeline** (bottom) | drag the handle to scrub through published versions; history is read-only |
| **EN / 中文** | workspace chrome only — comments stay in whatever words they were written in |
| **Delete** | on the comment, once it has words in it |
| **Clear all** | in the comment list footer, behind a confirm |
| **Send to Claude** (⌘⏎) | sends straight through — no preview step — and wakes you up. It greys out until something actually changes |

There is no resolve button: **you** close comments out by addressing them. Comments are located by where they are and the words they sit on — never by CSS selectors, and the user never sees markup.

## 5 · Catch the review, and hold up your end of the conversation

After starting the server, arm a waiter with **`run_in_background: true`**. It exits the moment a review lands, which re-invokes you:

```bash
until [ -f "$(dirname "$FILE")/.ui-review/$(basename "$FILE" .html)/pending" ]; do sleep 3; done
```

When it fires:

1. Delete the `pending` file — or the next waiter returns instantly.
2. Read `feedback.md` (its path is inside `pending`). It carries a markdown brief plus a JSON block with every comment's place, anchor text, severity, screen size and thread.
3. **Apply every comment that isn't addressed**, `must` first. Locate each from its **anchor text plus coordinates** at the screen size it was made at.
4. **Ask instead of guessing.** If a comment is ambiguous, reply to it — the question appears on the mark itself and the user answers there:
   ```bash
   node "$SKILL/assets/review-server.mjs" reply --file "$FILE" \
     --comment c7f2a1 --text "Every overdue row, or only the ones assigned to you?"
   ```
   That comment goes to *Claude asked* until they answer, which flips it back to open and returns it in the next round with their reply attached.
5. If a comment is genuinely wrong for the design, reply saying why rather than silently skipping it.
6. Publish, closing out what you actually did:
   ```bash
   node "$SKILL/assets/review-server.mjs" publish --file "$FILE" \
     --label "Filters collapsed, overdue sorts first" --addressed c1f3k2,c9dk1
   ```
   Only `--addressed` marks a comment done — the user has no button for it, so a comment you quietly skip stays open and comes back.
7. **Re-arm the waiter** and say what changed in a few lines. Then wait — don't ask "shall I continue?", the loop is the point.

The workspace never swaps the page out from under the reviewer: while you work it shows *"Claude is working…"*, and on publish it offers **"vN is ready — Review changes"**. Publish once, when the round is done.

## 6 · Share it for review

For anyone who isn't at this machine, flatten the same workspace into one self-contained file and publish it with the Artifact tool (favicon `🎨`):

```bash
node "$SKILL/assets/bundle-artifact.mjs" --file "$FILE" --out review.html
```

The page and the last 3 versions are inlined; comments persist in `localStorage`; **Send** becomes **Copy for Claude**.

## Notes

- **Never edit `assets/workspace.html`, `review-server.mjs` or `bundle-artifact.mjs`** to fit a project — they're the engine. Only the page under review is yours.
- State lives in `<dir>/.ui-review/<name>/` beside the file — versions, reviews, threads, and the `pending` sentinel. The page itself stays clean.
- The server binds to `127.0.0.1` only. Port 7788 busy usually means a review server is already running — pass `--port`.
- `node "$SKILL/assets/review-server.mjs" status --file "$FILE"` prints the current version and whether a review is waiting.
- Full command reference and troubleshooting: `references/workflow.md`.

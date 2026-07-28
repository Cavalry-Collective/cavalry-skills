# Resolving the design source

A mockup is only useful if it looks like the thing it will become. Resolve one
source and stick to it for every iteration — mixing sources between versions is
the fastest way to make a review loop feel like it's going backwards.

## 1 · A reference site the user names

Match a real product's look — by measuring it, not by remembering it. Use the
Chrome tools:

1. `navigate` to the URL in a new tab. Dismiss the cookie banner first (decline
   non-essential) so it is in neither the screenshots nor the numbers.
2. Screenshot at each size the mockup needs — 1440 first, then 390 if the design
   has to work small. Save them beside the page under review.
3. Run **`assets/harvest-reference.js`** with the javascript tool, at the width
   the mockup will lead with (the workspace offers 2560 / 1440 / 834 / 390). It
   returns JSON:

   | | |
   |---|---|
   | `palette` | backgrounds, text and border colours, **weighted by how much of the page they cover** — so the dominant surface sorts above an accent used once |
   | `type` | families in use, the real size/weight/line-height combinations, tracking, and the first few headings with their actual sizes |
   | `shape` | radii, shadows, and the spacing values the page actually repeats |
   | `layout` | nav model (top bar / side rail) and its size, content width, grid column templates, how many tables and inputs |

   Every number is a value the page is really painting. A colour eyeballed off a
   screenshot is always slightly wrong, and twenty slightly-wrong values is what
   makes a mockup read as a knock-off of the thing it is meant to be.
4. Note what the JSON can't see: button hierarchy, density, how empty states
   read, what the page leads with.
5. Write it all to `<page-dir>/<name>-reference.md`, screenshots beside it. Every
   later iteration reads that file instead of re-scraping — which is what stops
   v4 drifting away from v1's source.

Ignore transient page chrome — cookie banners, promo strips, A/B experiments.

**Never sign in to capture a page.** If the real reference is behind a login, ask
the user to navigate there themselves and tell you when to capture.

Copy the *layout and system*; leave logos, wordmarks, photography and real copy
as placeholders.

## 2 · Reference screenshots the user provides

Read every image, then derive the same list by eye: palette, type scale, spacing
rhythm, radii, shadow depth, component shapes, nav model. Write it to the same
reference file and **mark each value as inferred** — the first review round is
where the user corrects the ones you read wrong, and they can only do that if
they know which were guesses.

If they give you both a URL and screenshots, the URL wins for values and the
screenshots for intent — they chose those particular frames for a reason.

## 3 · The project's own design system

Look for a `design/` folder (in the project, or a sibling repo the user points
at) containing:

- **`tokens.css`** — the token source. Copy the tokens you need into each
  screen's `:root`. Do not re-derive values; do not invent new ones. If a screen
  needs a value that isn't in the scale, that's a signal the screen is wrong,
  not the scale.
- **`design-guide.html`** — component specimens. Match these shapes.
- **`CLAUDE.md`** (or equivalent) — the project's own design principles.
  **Read it and follow it; it outranks this skill's defaults.**

Cavalry projects keep this at `cavalry-template-spa/design` — check for a
sibling checkout before asking.

## 4 · Nothing found

Ask. One question, with the options: match a site (URL), match screenshots, or
use a specified design system. Don't quietly invent a house style — the user
will spend their whole first review correcting a palette you guessed.

## Keeping the page self-contained

Whatever the source, the page file must have:

- tokens inline in `:root`, no imported stylesheet
- no external fonts — use a system font stack that reads like the reference
  (`ui-sans-serif, -apple-system, "Segoe UI", Inter, system-ui, sans-serif`),
  and note in the reference file which real font it stands in for
- no external scripts, no network calls
- images as data URIs, CSS shapes, or omitted

This is what lets the same file be served locally *and* inlined into a
CSP-restricted Artifact bundle without a second code path.

# Resolving the design source

A mockup is only useful if it looks like the thing it will become. Resolve one
source and stick to it for every iteration — mixing sources between versions is
the fastest way to make a review loop feel like it's going backwards.

## 1 · A reference site the user names

Match a real product's look. Use the Chrome tools:

1. Open the URL in a new tab and screenshot it at the target width (1440 desktop / 390 mobile).
2. Pull the actual values rather than eyeballing them — run this with the
   javascript tool on the page. Capture at the size the mockup will lead with
   (the workspace offers 2560 / 1440 / 834 / 390):

```js
const seen = new Map();
const bump = (k, v) => v && seen.set(k + '|' + v, (seen.get(k + '|' + v) || 0) + 1);
for (const el of document.querySelectorAll('body *')) {
  const c = getComputedStyle(el);
  if (el.offsetParent === null) continue;
  bump('color', c.color); bump('bg', c.backgroundColor);
  bump('font', c.fontFamily.split(',')[0].replace(/["']/g, ''));
  bump('size', c.fontSize); bump('weight', c.fontWeight);
  bump('radius', c.borderRadius); bump('border', c.borderColor);
  bump('shadow', c.boxShadow === 'none' ? '' : c.boxShadow);
}
JSON.stringify([...seen].sort((a, b) => b[1] - a[1]).slice(0, 60));
```

3. Note the **structure** too, not just the palette: nav model (top bar / side
   rail / both), density, how tables and forms are laid out, button hierarchy,
   how empty states read.
4. Write it all to `<page-dir>/<name>-reference.md` and drop the screenshots
   beside it. Every later iteration reads that file instead of re-scraping.

Ignore transient page chrome — cookie banners, promo strips, A/B experiments.

## 2 · Reference screenshots the user provides

Same output, derived by eye: palette, type scale, spacing rhythm, radii, shadow
depth, component shapes. Write it to the same reference file. Say what you
inferred so the user can correct it in the first review round.

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

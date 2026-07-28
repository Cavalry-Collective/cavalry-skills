# Design source — example.com

Captured 28 Jul 2026 at 1440 × 900 with `assets/harvest-reference.js`.
Screenshot: `reference/example-com-1440.png`.

Every value under **Measured** was read off the live page's computed styles. Every
value under **Inferred** is one example.com does not contain — it is a two-paragraph
document, so anything a real screen needs (rules, hover states, a table) had to be
derived from what is there. The inferred list is the one to argue with first.

## Measured

| | |
|---|---|
| Page background | `#eee` — `rgb(238, 238, 238)`, the whole canvas |
| Ink | `rgb(0, 0, 0)` — pure black, not a softened near-black |
| Link / accent | `#348` — `rgb(51, 68, 136)`, the only chromatic colour on the page |
| Family | `system-ui, sans-serif` — no webfont, no fallback stack beyond that |
| Body type | 16px / 400 / line-height `normal` (no explicit leading anywhere) |
| Heading | h1 24px / 700 (`1.5em`) — one step up, nothing more |
| Rhythm | 16px — the only repeated spacing value, from default `1em` paragraph margins |
| Measure | `60vw` centred = 864px at 1440, with `15vh` above and below |
| Radius | none |
| Shadow | none |
| Border | none |
| Structure | no nav, no tables, no inputs, no grid |

The page also sets `opacity: .8` on its content block, which is why the black text
reads as dark grey. Kept, because it is the single most recognisable thing about how
this page looks.

## Inferred

These are mine, not example.com's:

- **Hairline rules** at `rgba(0,0,0,.14)` for table rows — derived from the ink at the
  weight the page's own text renders at, since there is no border anywhere to copy.
- **Row hover** as a 4% ink wash. No hover state exists on the source to match.
- **Status wording** as plain text, not pills — the source has no component with a
  background fill, and inventing one would be the first thing to drift.
- **Monospace** for domain names: `ui-monospace, SFMono-Regular, Menlo, monospace`.
  The source has no monospace at all; this is a judgement that names are data.
- **Type steps** at 13px and 11.5px for secondary and label text. The source only
  proves 16 and 24.

## Standing in for

`system-ui` is the real font here, not a stand-in — example.com genuinely ships no
webfont, so the mockup matching it exactly is correct rather than an approximation.

## Rules for later rounds

Read this file instead of re-capturing. If a round needs a value that is in neither
list, add it to **Inferred** with a line saying why — that is what keeps v5 looking
like the same page as v1.

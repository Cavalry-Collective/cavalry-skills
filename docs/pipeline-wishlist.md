# Wishlist — the Visual Stack pipeline

**Status: mostly built.** This repo ships seven skills today — `go` (the "what now?" entry, planned
below as `next`), `start` (stage 0, né `init`), `wireframe`, `spec` (stage 3), `user-story-map`,
`phase-preview` (stage 5) and `phase-build` (stages 6–8, merged into one skill). Only
`requirements` (stage 1) and the visual layers noted below remain. This document records the chain's
design and the decisions already made so they don't have to be re-argued.

**Reviewed wireframes live in [`wireframes/`](wireframes/)** — `requirements`, the one still-unbuilt
stage, alongside the designs that `spec`, the phase slider and the build maps were built from. They are
reviewed designs, not implementations; `start`'s chooser was one of them until it became
`plugins/vstack/skills/start/assets/chooser.html`.

## The problem

Spec-driven tooling makes you remember the order. With speckit the recurring friction isn't any
individual command — it's *"which one comes next?"*, every single time, on every project. The
sequence lives in your head instead of in the tool.

So the wish is a chain where **every stage names its successor**, plus one command that answers the
question outright. You should never have to remember the pipeline; the pipeline should remember you.

The second wish is that the chain **doesn't cost the standalone tools anything**. Most people meeting
this plugin want a wireframe or a story map, full stop. If chaining makes those two heavier to use,
the chain isn't worth having.

## Every stage is visual

The third wish, and the one that decides whether any of this is worth using.

Spec-driven tooling's other failure is that it **prints**. Speckit's output is a long document, and
long documents don't get read — they get skimmed once, approved to be polite, and then contradicted
by the code three days later. The review that mattered never happened, and nobody noticed until the
build was wrong.

So: **every stage produces something you operate, not something you read.** A page, in a browser,
with the actual thing on it — draggable, drillable, editable — and a live link back to the session so
what you change is what gets built. Prose is the *export*, never the interface.

Three already work this way, which is why they're the ones that get used: the story map is a grid you
drag cards around, the wireframe is a page you comment on directly, and `start` is a form you tick.
`phase-preview` joined them when the phase slider shipped. This section is the plan for the rest.

Three rules fall out of it:

- **The artifact is the source of truth, not a view of one.** The story map already works this way —
  its JSON *is* the plan, and any markdown is generated from it. Every visual stage inherits that.
  A picture generated *from* a document drifts from it; a document generated *from* the picture
  can't.
- **No approve/reject.** It's tedious and it produces false approval — the same reason `wireframe`
  has no resolve button today. You change what's wrong and the change *is* the feedback.
- **Edits flow back without copy-paste.** Both live-link mechanisms in this repo already do this;
  see *One engine, not eight* below.

## The stages

```
  ◆ /vstack:go  ←  always answers "what now?"  (planned here as `next`)

  ◆ 0  start              multi-step form: what you're building → stack → confirm
                          (or skip development, or record an existing app untouched)
    1  requirements       specs/requirements.md
  ◆ 2  wireframe          design/<feature>.html            ──┐ review loop
  ◆ 3  spec               .vstack/specs/<feature>.json       │
                          → specs/YYYY-MM-DD-<feature>.md    │
  ◆ 4  user-story-map     specs/story-map.json               │
  ◆ 5  phase-preview    design/phase-<n>/<feature>.html  ──┘ review loop
  ◆ 6–8 phase-build       one skill, three tabs — api, ui, infra — repeat per phase

  ◆ = shipped
```

`wireframe` and `user-story-map` also **work standalone** — no pipeline, no template, nothing to set
up; see *Standalone stays first-class*. `start` and `phase-preview` are pipeline-shaped but neither
needs the chain to exist yet.

Everything from stage 5 on is named `phase-*`, because everything from stage 5 on happens **once per
release phase**. That's the part of the chain people lose track of, so the names carry it.

| # | Skill | Would read | Would write |
|---|---|---|---|
| — | ◆ `go` | `.vstack/pipeline.json`; failing that, the conversation and the dir | nothing — reports where you are, offers the next stage |
| 0 | ◆ `start` | the cwd, `stacks/`, `add-ons/` (or its catalog snapshot pre-clone) | `specs/product.md` + `.vstack/pipeline.json`, and — full path only — a fully instantiated repo: template cloned, one pack kept, add-ons chosen, toolchain filled, design guide confirmed (the whole Day-1 checklist) |
| 1 | `requirements` | the conversation, any brief or notes | `specs/requirements.md` |
| 2 | ◆ `wireframe` | `specs/requirements.md`, `design/tokens.css`, `design/CLAUDE.md` | `design/<feature>.html`, an inventory row in `design/README.md` |
| 3 | ◆ `spec` | `design/<feature>.html`, `specs/product.md`, the conversation | `.vstack/specs/<feature>.json` (source of truth) → `specs/YYYY-MM-DD-<feature>.md` (generated), fills that row's *owning spec* |
| 4 | ◆ `user-story-map` | `specs/*.md` | `specs/story-map.json` + `specs/story-map.html` |
| 5 | ◆ `phase-preview` | `specs/story-map.json`, `design/<feature>.html` | `design/phase-<n>/<feature>.html` |
| 6–8 | ◆ `phase-build` | the phase-N slice, `design/phase-<n>/`, **the codebase itself** | `.vstack/build/phase-<n>.json` (the plan + build record), then the code — api → ui → infra |

`start` and `go` are additions to the original sketch. `start` is what makes "the chain always starts
from the template" true without dead-ending someone in a bare directory — and since the multi-step
form landed it no longer *requires* the template: it can set up a specs-and-design-only workspace, or
record an existing codebase without touching it. `go` is the entire answer to the problem at the top
of this page. **`stack` is no longer a separate stage** — it folded into `start`, which is where the
whole Day-1 checklist now lives (see below).

### The phase loop

Stages 0–5 would run **once** — stage 5 included, producing one entry per phase in a single pass, so
the build loop never goes back for a design. (The final phase usually *is* the base wireframe; record
it as that path rather than copying the file.)

Stages 6 → 7 → 8 then run **in that order within a phase**, and the trio repeats per phase:

```
once ──  start → requirements → wireframe → spec → user-story-map → phase-preview
                                                                          │
per phase ────────────────────────────────────────────────────────────────┤
                                                                          ▼
            ┌──────► phase-build — api, then ui, then infra, one skill ──┐
            │                                                            │
            └───────────── phase += 1, while phases remain ◄─────────────┘
```

**`phase-build` owns the phase counter** (the rule was written for `phase-build-infra`; the merge
moved it to the one skill) — on completing phase N it sets `phase: N + 1`, or `stage: "done"` if N
was the last phase. No other stage touches it after `user-story-map` sets it to `1`. Without this
rule nobody advances the phase and the loop stalls silently.

### Stage 5 — built

`phase-preview` is the stage that earns the chain its keep: it takes a design everyone has already
signed off and **subtracts** it to each release phase, so the phase-1 build target looks exactly like
the approved design minus what isn't in phase 1 yet. It is the one stage with no equivalent
elsewhere, and it needs nothing from the pipeline — a base wireframe and a set of phases are enough —
so it was built first. See `plugins/vstack/skills/phase-preview/`.

Three things settled while building it, worth carrying into the rest of the chain:

- **Phases are cumulative** (phase 2 shows phase 1 too), and every phase is cut **from the original**,
  never from the previous phase's output, so errors don't compound.
- **The element→phase plan is written and confirmed before any HTML is touched.** That turns each
  phase into a lookup rather than a fresh judgement, and it surfaces elements no story covers.
- **The discipline is checked, not promised.** `assets/check-subtraction.mjs` asserts the stylesheet
  is byte-identical, no element exists that isn't in the base, and survivors keep the base's exact
  order. Skeletons standing in for later-phase gates carry `data-phase-skeleton` and are exempt. This
  is the pattern to reuse anywhere a stage claims to have preserved something.

When the pipeline exists, the only change is where it reads its inputs from and that it writes
`artifacts.wireframes[].phases`.

**It started out non-visual** — one file per phase, each handed to `wireframe` separately: correct
output, wrong shape for the question people ask. The phase slider fixed that; see
*What each stage looks like* below.

## What each stage looks like

| # | Stage | What you see | What you do to it |
|---|---|---|---|
| 0 | `start` ✓ | a **multi-step setup form** — what → details → stack → confirm | answer in cards, take the recommended stack or override it, skip development entirely, watch what gets deleted |
| 1 | `requirements` | a **live concept map**, built as you write | drag cards anywhere; link them; label the links |
| 2 | `wireframe` ✓ | the page itself, in a review workspace | comment straight on it |
| 3 | `spec` ✓ | a **drill-down tree**, collapsed to headlines | expand, annotate, delete, add — no approve/reject |
| 4 | `user-story-map` ✓ | the grid of activities × phases | drag cards to re-slice |
| 5 | `phase-preview` ✓ | the page, with a **phase slider** under it | drag the slider to watch phases appear |
| 6–8 | `phase-build` ✓ | **one board, three tabs** — endpoints, atomic-design tree, resources | adjust before the build starts, then watch nodes light up as they're built |

✓ = already built and already visual.

### 0 · `start` — the setup form · **built**

*Shipped as `plugins/vstack/skills/start/` (né `init`). What the stage does is under
[Stage 0](#stage-0--start-which-is-the-whole-day-1-checklist); this is what it looks like while doing it.*

A four-step form with a progress header — **what** are you building → **details** (kind, name,
one-liner) → **stack & add-ons** → **confirm** — with a shopping-basket cart alongside throughout,
holding everything picked so far. **The delete list moved out of the UI** after review (*"no need
what gets deleted"*): since deleting *is* the adoption mechanism, the skill still shows the delete
list in chat and gets a yes before removing anything — the safety moved to the apply step rather
than disappearing.

The first two steps ask in product terms (*"a product people sign in to"*, *"organisations subscribe,
teams sign in"*) and their answers **pre-select a recommended stack** on step 3 — badged, not forced.
Step 3 also carries the escape hatch: *skip development setup* for people who only want UI and specs.
Step 4 confirms everything with edit links back into any step. The answers outlive the form as
`specs/product.md`, the product's constitution. Confirm once, and `start` performs every deletion and
fills the toolchain — or, on the skip path, just creates `specs/` + `design/` and writes the records.

Run in an **existing codebase**, the form opens straight on the confirm step, pre-filled from what
`start` inferred out of the repo — final tweaks, then submit, and nothing in the code is touched.

### 1 · `requirements` — the live concept map

*Design reviewed to v6 in [`wireframes/requirements-map.html`](wireframes/requirements-map.html); **not
approved**, and deliberately parked. The notes below are what the review settled, not a finished spec.*

You write requirements in prose; the map builds itself beside you. The map is the artifact — the
written `specs/requirements.md` is generated from it.

Four things the review changed, all worth keeping:

- **No imposed taxonomy.** Not product→capability→feature→behaviour, and not concept/attribute/rule
  either. Cards and the links between them, used however the thinking wants to go. Colour marks the
  *branch*, so it organises without meaning anything.
- **It maps concepts** — the nouns the product has (Role, Candidate, Application, Stage, Scorecard)
  and the rules that constrain them. A spec and an API are both built from the domain, not from a
  feature list.
- **Relationships and flows are first-class**, as labelled links on top of the hierarchy —
  *Candidate → applies via → Application → then → Interview*. Same mechanism for "belongs to" and
  "what happens next"; the label is the difference.
- **Cards stay where you drop them.** Auto-tidy is the default, a dropped card pins, and *Tidy up*
  puts everything back. Drop *on* a card to nest instead.

**The multi-view idea was tried and cut.** A site-map and flow toggle looked good on paper — the same
requirements arranged three ways to surface gaps — and read as clutter in practice. One view, done
properly.

**Still not right.** Parked after v6 rather than shipped, so whatever gets built here starts from
another round, not from this text.

### 3 · `spec` — the drill-down · **built**

*Shipped as `plugins/vstack/skills/spec/` on the shared `lib/json-bridge.mjs` engine. The tree JSON
at `.vstack/specs/<feature>.json` is the source of truth; the dated markdown under `specs/` is
generated every round with a "this file is an export" header. Notes are the conversation — the user
annotates, Claude answers by fixing the spec or replying in a note.*

The complaint this fixes: a spec today is a long document nobody reads.

So it opens **collapsed to headlines** — goals and story titles only, one screen, no scrolling. Click
a story to open its acceptance criteria; click a criterion to see how it will be verified. You go
deeper only where you care, and depth is never in your way.

- **Notes attach anywhere**, at any level.
- **Delete and add inline** — a story that shouldn't exist goes away, a missing one gets typed in.
- **No approve/reject.** Editing it *is* approving it.
- **Live sync both ways**, like the wireframe: your changes reach the session, and when the spec is
  regenerated the page offers a refresh rather than yanking the tree out from under you.

### 5 · `phase-preview` — the phase slider · **built, view only**

*Shipped as `assets/phase-view.mjs` plus phase mode in the review workspace. It reads whatever
`phase-<n>/` directories exist beside the base and bundles them into one self-contained file; the
per-phase files stay the source of truth and the build stages still consume those.*

It wrote one file per phase and handed each to `wireframe` separately. That's the wrong shape
for the question people actually ask, which is *"what changes between phases?"* — and you can't see
that by opening three files in three tabs.

Instead: the page in its own frame, **a slider along the bottom, one stop per phase**. Drag it and
the design fills in as features arrive. Phase 1 → 2 → 3 becomes a motion you can scrub, so what each
phase adds is obvious at a glance.

`wireframe` already shipped almost exactly this — its version timeline is a draggable handle that
scrubs published versions. Same interaction, different axis, and now literally the same component:
the scrubber lives in `lib/shell/` and all three pages call it.

**Reviewed to v5 in [`wireframes/phase-preview-slider.html`](wireframes/phase-preview-slider.html).**
It ended up *being* the wireframe workspace — same tokens, same topbar, same canvas and browser
window, same timeline markup — with the version rail showing phases and one addition, a
**Highlight new** switch. That is the strongest form of "one engine, not eight" found so far: not a
shared library, the same page serving a second purpose.

**It is view-only, deliberately.** Annotate, the comments panel and Send are all removed, because
**how editing should work here is unresolved**. The instinct is that changing something on a phase
view should change the *story map* — the phase truth lives in `specs/story-map.json`, so dragging a
feature into a later phase here is really a re-slice there. Nobody has designed what that looks
like. Until someone does, this stage shows and does not edit; a viewer that can't lie is worth more
than an editor that edits the wrong file.

### 6–8 · `phase-build` — the board · **built, as one skill**

*Shipped as `plugins/vstack/skills/phase-build/` — the trio merged into one skill with three tabs,
as the reviewed wireframe already had it. The same board is the pre-build plan and the live build view.*

The same shape three times, over three different subjects, as tabs on one board:

| Tab | The map is |
|---|---|
| Endpoints | the API — resources, routes, and what they return |
| Components | the atomic-design tree — atoms → molecules → organisms → pages |
| Resources | what gets provisioned, and what depends on what |

You see it **before the build begins** and adjust it — this is the cheapest possible moment to move
an endpoint or collapse two components, and the last moment before it costs code. Then Start turns
the same board into the progress view: Claude reports each node over the bridge
(`json-bridge.mjs patch --id <n> --set status=building|done|failed`) and the map colours in live —
the new-wishes live build view, delivered here.

**The map is colour-coded: what already exists vs what this phase adds.** That's the feature that
makes the later phases legible — and the colouring is honest by construction: *existing* means
**what is actually in the codebase**, read from it at plan time (the board stamps when), never what
a previous phase's plan said would be built. A map that colours from the plan would confidently lie
the first time a phase shipped late or partial.

## One engine, not eight

Six stages above want the same three components. Building them per-skill would be six copies of the
hard parts and six places for them to drift.

**The live link.** This repo had two implementations — `wireframe`'s SSE server
(`review-server.mjs`) and the story map's `bridge.py`. They do the same job: serve a self-contained
page on `127.0.0.1`, wake the session when the user sends, push updates back as an offered refresh
rather than a silent overwrite, and shut down cleanly when the tab closes. **The shared engine now
exists**: `plugins/vstack/lib/json-bridge.mjs`, generalized from `bridge.py` when `spec` and
`phase-build` were built.

**Three of the four skills run on it.** `user-story-map` has been migrated and `bridge.py` is gone:
the map JSON is the artifact, the template is served unmodified, and the page loads from `/doc`
(inline data is still there, and is what an Artifact copy runs on). One engine, one Node runtime, no
Python.

**`wireframe` keeps its own, deliberately.** `review-server.mjs` is not a second copy of the same
idea — it serves the page under review from the same origin, keeps frozen HTML versions and
per-version review folders, carries five sentinel files that four CLI subcommands read and write,
and rebroadcasts on `fs.watch`. json-bridge's whole model is *one JSON document, one seq, whole-doc
push*. Merging them would either strip what the review loop needs or grow the shared engine into a
superset of both, which is more places to drift, not fewer. Two engines with different jobs is the
honest answer.

**The page shell.** **Built**, as `lib/shell/` — and it turned out to be the biggest duplication in
the repo, because it was not one component copied five times but *two design systems drifting*.
`wireframe` and `spec` were on `--bg / --panel / --accent`, light-only; `phase-build`,
`user-story-map` and `start` on `--paper / --surface / --brand` with a dark ramp. Same roles,
different names, two different reds. The top bar was copy-pasted three ways and absent from the
fourth. One merged palette now serves all five, every page is theme-aware, and the bar — mark, page
name, theme, language, link dot, primary action — comes from one file.

**The scrubber.** **Built**, as `lib/shell/scrubber.*` plus `VSScrub`. `phase-preview`'s phase
slider and `wireframe`'s version timeline were the same control over different axes — the CSS was
byte-identical apart from a line wrap. The component owns the track, ticks, drag and caption; the
page says what the stops are and what showing one does. It paid for itself immediately: extracting
it *was* most of `phase-preview`'s slider, which is why that stage finally has one.

**The mind map.** Three stages (6–8) plus `requirements` want a directed graph with inline editing,
drag-to-reparent, and a two-state colour scheme. That is one component fed four datasets, not four
components.

One constraint shapes all of them: these pages are **self-contained, no external requests** — it's
what lets the same file work served locally, opened off disk, and published as an Artifact under
CSP. It also decides *how* a shared component can exist at all: nothing can be linked at runtime, so
the shell is stamped into each page by `lib/build-shell.mjs`, with a `check` mode that fails when a
page has drifted from it. Every existing skill in this repo is dependency-free for the same reason.
A graph layout engine is the first thing in this plan that genuinely tempts a dependency, and the
honest options are to hand-roll a simple layered layout or to inline a small one. Worth deciding
deliberately rather than discovering it halfway through building `requirements`.

## Standalone stays first-class

One rule would decide the mode:

> **`.vstack/pipeline.json` exists → pipeline mode. It doesn't → standalone.**
> `wireframe` and `user-story-map` never create it. Only `start` and `requirements` bring the
> pipeline into being — `go` reads it but never writes it.

| | Pipeline mode | Standalone |
|---|---|---|
| Inputs | `artifacts.*` from the state file | whatever the user says, plus any file they point at |
| Output path | `design/<feature>.html`, `specs/story-map.*` | **unchanged from today** — wherever the skill already writes when run cold |
| Design source | the template's `design/tokens.css` + `design/CLAUDE.md` | today's priority order — reference site → screenshots → project design system → ask |
| State | rewrites `.vstack/pipeline.json` | writes none |
| Ending | *"Next: `/vstack:spec` — shall I run it?"* | just the result. **One** closing line may mention the chain exists; it never proposes the next stage |

The other six stages would be pipeline-only: run one cold and it offers `/vstack:start` rather than
improvising a project structure.

## Stage 0 — `start`, which is the whole Day-1 checklist

The chain's **full path** runs on a repo instantiated from
[`vstack-template-base`](https://github.com/Cavalry-Collective/vstack-template-base). Its
`design/`, `specs/`, `stacks/`, `add-ons/` and `CLAUDE.md` contracts are what the later stages read
and write; without them stages 6–8 have no architecture to build against. Since the multi-step form
landed, two lighter paths sit beside it — **skip development** (no clone; just `specs/` + `design/` +
the records) and **existing app** (record only, code untouched) — and every path writes
`specs/product.md`, the constitution the later stages read first.

On the full path, `start` clones the template and then **interviews you until it is a project** —
the form having already captured most of the answers. There is no separate
`stack` stage: choosing the stack was never a thing you could do halfway through, and splitting the
13-step Day-1 checklist across two skills only created a seam where steps could fall through.

1. **Clone** `vstack-template-base` and open the workspace *(Day-1 1–3)*.
2. **Read the contracts** — root, backend, frontend, db, infra `CLAUDE.md` *(4)*.
3. **Interview for the stack.** One pack survives; the rest are deleted. Today's packs are
   `nextjs-nestjs-postgres`, `taro-fastify-mysql-tencent`, `vercel` (client-rendered SPA) and
   `vercel-ssr` — so the questions are about rendering model, hosting, and whether there's a separate
   backend, not about pack names *(5)*.
4. **Interview for add-ons.** Same mechanism: every directory left under `add-ons/` is adopted, and
   opting out *is* deleting the directory *(6)*.

   **This is where the built chooser diverges from the plan.** The proposal was to ask in product
   terms and never name the add-on — "will one deployment serve several organisations with strictly
   separated data?" rather than "do you want multi-tenancy?". Review rejected it: *"the users are
   highly technical, we can use technical terms."* The shipped cards lead with the name
   (`Multi-tenancy`, `saas-billing`), a one-line description, and tags. The product-shaped phrasing
   survives as **how you ask in conversation** when the chooser isn't in play — it is still the only
   way someone answers on day zero without knowing the catalogue.
5. **Fill the toolchain** from the chosen pack — the `<pm>` command block, `ci.yml` gates,
   `deploy.yml`, `.env.example` *(7)*.
6. **Declare the primary form factor** in `apps/frontend/CLAUDE.md` *(8)*.
7. **Rebrand and confirm the design guide** — `design/tokens.css` + `design-guide.html`. This gates
   everything visual: `wireframe` must not build screens against an unconfirmed system *(9)*.
8. **Copy runtime config**, then the repo-level steps — protect `main`, stand up staging if the pack
   defines one, confirm CI green and no placeholder survives *(10–13)*.

**Deleting is the adoption mechanism**, not cleanup. The template is explicit about this: exactly one
directory under `stacks/`, and only the wanted directories under `add-ons/`. Every area's `CLAUDE.md`
then picks up the survivor automatically, with no generated file to drift. So `start` really does end
by removing most of what it just cloned — that's the design, and it's worth saying out loud before
someone stops it mid-delete.

**The cost of merging, stated plainly.** `stack` used to sit at position 6, *after* specs existed —
so the choice was informed by what was actually being built. Asking at `start` means choosing before
anyone has written a requirement. Two things make that survivable, and they should be built in:

- Ask **product-shaped questions** when interviewing in conversation. Someone can answer "do several
  companies share one deployment?" on day zero; they can't answer "do you want the multi-tenancy
  add-on?". (The chooser page shows names and tags instead — see step 4.)
- **Adoption stays reversible.** An add-on is a directory — a later stage that discovers a missed
  capability can restore it from the template, and `start` should say so rather than implying the
  interview is one-shot. The stack pack is the genuinely expensive one to change late; weight the
  questioning accordingly.

## The handoff file

`.vstack/pipeline.json` at the project root, **committed** — a project record, not scratch.

```json
{
  "version": 1,
  "project": "cavalry-hiring",
  "stage": "spec",
  "phase": 1,
  "specsOnly": false,
  "artifacts": {
    "product": "specs/product.md",
    "requirements": "specs/requirements.md",
    "specs": ["specs/2026-07-28-candidate-pipeline.md"],
    "storyMap": "specs/story-map.json",
    "wireframes": [
      {
        "feature": "candidate-pipeline",
        "base": "design/candidate-pipeline.html",
        "phases": { "1": "design/phase-1/candidate-pipeline.html" }
      }
    ],
    "stack": "nextjs-nestjs-postgres",
    "addOns": ["test-mode", "otp-auth"]
  },
  "history": [
    { "stage": "wireframe", "at": "2026-07-28T09:12:00Z", "note": "3 review rounds" }
  ]
}
```

| Field | Meaning |
|---|---|
| `stage` | the **last completed** stage id. `go` proposes its successor. `"done"` is terminal |
| `phase` | the phase in flight. `null` until `user-story-map` sets it to `1`; `phase-build` advances it |
| `specsOnly` | `true` when `start` skipped development setup — `phase-build` doesn't apply until `start` runs again |
| `artifacts.*` | repo-relative paths, always. A stage writes only the keys it produced. `product` is `start`'s constitution file |
| `history[]` | append-only, one entry per completed stage |

Rules worth pinning now:

- **Preserve unknown keys** on rewrite — a newer skill's field must survive an older one's write.
- **Never invent a path.** A stage records only what it wrote; a missing key means the producing
  stage hasn't run, and that absence is the signal the next stage acts on.
- **Append vs. replace.** For the per-feature stages (`wireframe`, `spec`), re-running on a *new*
  feature appends to `artifacts.wireframes[]`; re-running on an *existing* one replaces that entry in
  place. Match on `feature`, never on array position.
- Stages stay **re-runnable and skippable**. `go` proposes the successor; it never refuses a jump.

## The footer every SKILL.md would end with

Fixed shape, so the chain is visible from inside any stage. On a dual-mode skill the standalone
escape comes first, because that's the common case:

```markdown
## State & handoff

**No `.vstack/pipeline.json`?** You're standalone — everything above still applies. Take the brief
from the user, write where they ask, and stop when the page is right. Skip the rest of this section.

- **Read** `.vstack/pipeline.json` → `artifacts.requirements`. Present but the key is missing —
  the previous stage hasn't run; offer `/vstack:requirements` rather than guessing.
- **Write** `design/<feature>.html`, the `design/README.md` inventory row, and
  `artifacts.wireframes[]` + `stage: "wireframe"`.
- **Next** — `/vstack:spec` turns this wireframe into a written spec. Offer to run it; don't ask
  whether to continue.
```

Each skill would restate its own lines rather than reading a shared contract file — a few lines of
duplication buy robustness against a skill being invoked cold, which for the dual-mode two is normal.

**Offer, don't interrogate.** A stage ends by naming its successor and offering to run it. It doesn't
ask *"shall I continue?"* in the abstract, and it doesn't run the next stage unasked.

## Renames — done

| Was | Is | Cost |
|---|---|---|
| `ui-review` | **`wireframe`** | broke `/vstack:ui-review` for anyone who had it; plugin went to 2.0.0 |
| `init` | **`start`** | broke `/vstack:init` for anyone who had it; plugin went to 4.0.0. Internal paths (`.vstack/`, `choice.json`) kept |
| `next` (planned) | **`go`** | none — it shipped under the new name, nothing to break |
| `user-story-map` | *unchanged* | none — it keeps its name, and gains only the handoff footer when the chain lands |
| `.ui-review/`, `.vstack-bridge/` | **`.vstack/local/<tool>/`** | orphaned reviews mid-flight and in-browser comment drafts on every machine that had them; taken deliberately in 4.4.0 |

The engine's internal paths kept the old names for a long while — renaming them orphans work in
progress, and for two releases that cost bought nothing visible. It stopped being free once a
project carried three dot-directories for one product. Every tool now writes under
`.vstack/local/<tool>/`, resolved by `lib/workdir.mjs`: the enclosing `.vstack` when the artifact
already lives in one, the one beside it otherwise. The `localStorage` keys moved with them,
`ui-review:*` → `vstack:review:*`.

**`local/` is the line, not the tool name.** The first cut put each tool at the top of `.vstack/`,
which meant `.vstack/spec/` (machine) sitting one letter from `.vstack/specs/` (repo), a new
`.gitignore` entry per engine, and — because the JSON bridge is shared by three skills — a
directory named after an `.mjs` file rather than anything a user invokes. Splitting on
*machine vs repo* first and naming the tool second fixes all three: one ignore line, no
near-miss names, and `spec`, `user-story-map` and `phase-build` each get their own directory
because the bridge is told which skill it is serving (`--tool`).

**The name costs one thing, and it's mitigated, not solved.** The skill does two jobs — generate a
page, and run the comment loop over *any* HTML file. `wireframe` names the first and not the second,
so the description carries the review triggers explicitly ("review, annotate, mark up or comment on a
page or design"). If someone with an existing screen to critique still can't reach it, the trigger
list is where to look first.

## Two indexes that must agree

`design/README.md` carries the template's inventory table — *screen · prototype file · owning spec* —
the **human** index; `artifacts.wireframes[]` is the **machine** one.

- `wireframe` adds the row when it creates a page, leaving *owning spec* blank.
- `spec` fills that row's *owning spec* when it writes the spec.
- **Phase screens get no row.** The table indexes *screens*, and a phase screen is the same
  screen; its path is `design/phase-<n>/<feature>.html` by convention, recorded under
  `wireframes[].phases`.

## New wishes — 2026-07-29

Where a wish touches an existing section, the overlap is noted so the two don't get designed twice.
Items 1–3 shipped on 2026-07-29 with plugin 4.0.0.

1. ~~**`init` becomes a multi-step form.**~~ — **built**, as part of the `start` rename. Four steps
   (what → details → stack → confirm) with a recommended pack pre-selected from the answers, a
   **skip development setup** path that creates a specs-and-design-only workspace with no clone, the
   answers saved as `specs/product.md` (the constitution — `product.md`, not `constitution.md`, was
   the naming call), and an **existing-app mode** that infers from the repo and opens the form on a
   pre-filled confirm step, recording the project without touching code. See
   [Stage 0](#0--start--the-setup-form--built).

2. ~~**`/vstack` bare, in any chat.**~~ — **built**, as `/vstack:go`, absorbing the planned `next`
   (one skill: pipeline mode when `.vstack/pipeline.json` exists, chat + directory inference when it
   doesn't). A truly bare `/vstack` turned out to be **impossible from a plugin** — plugin skills are
   always namespaced — so `go`'s SKILL.md documents a one-line copy to `~/.claude/skills/vstack/` for
   anyone who wants it.

3. ~~**Drop the `/cavalry` prefix.**~~ — **done.** The repo was already clean; the prefix came from a
   stale `cavalry@cavalry-collective` 1.1.0 plugin installed before the vstack rename. Fixed by
   refreshing the marketplace and swapping the installed plugin to `vstack@cavalry-collective`.

4. ~~**The `phase-build-*` stages get a live build view.**~~ — **built**, with `phase-build`
   itself: the same board is the pre-build plan and the progress surface, nodes pulsing while built
   and filling in as they land, reported per node over the bridge.

5. **The visual screens link into one flow.** Someone using the stack end-to-end should transition
   smoothly from one stage's screen to the next, not open a fresh page per skill — plus a
   **multi-step progress bar** showing where in the pipeline they are.

   **Half of this now exists.** `lib/shell/` gives all five pages one bar, one palette and one set of
   controls, and the language and theme a reviewer picks follow them from stage to stage. What is
   still missing is the *flow*: a pipeline progress bar in the bar's eyebrow slot reading
   `.vstack/pipeline.json`, and a way for one stage's page to hand off to the next without going back
   to the terminal. The shell is where both belong — the slot and the stamper are already there.

6. **A README section on coexistence: "can I use this with Superpowers / gstack / speckit / …?"**
   People will arrive already using another skill stack, and the README should answer whether these
   compose, conflict, or overlap. **The principle landed** with `spec`/`phase-build`: vstack is
   tool-agnostic — plain files in and out, only `.vstack/` owned, no hooks, no interception — and
   the README now says so ("Works with the tools you already use"). That also answers the *Spec Kit* bullet:
   nobody owns `specs/`; vstack owns only the files it wrote. **Still open**: the per-tool
   comparison (what overlaps with speckit's flow, what Superpowers changes) deserves the deep think
   before it becomes a detailed README section.

7. **A product showcase section** — highlight products actually made with the stack. Nothing sells a
   visual-first pipeline like the things it shipped.

## New wish — 2026-08-03

**Area comments can optionally carry a visual capture — deferred; do not implement.** Sometimes the
box, element anchor and words are still not enough to preserve an ephemeral UI state. The lightest
credible version would use the browser's native `getDisplayMedia()` API, take one frame, and crop it
to the area comment with Canvas. It should not add Playwright or a DOM-to-image dependency.

If this is revisited, keep the boundary narrow:

- offer **Attach visual** only on area comments in served local/live reviews;
- prefer the current tab, but show a Retake/Remove preview because the browser must show its share
  picker on every capture and cannot force the reviewer to choose this tab;
- stop the capture stream immediately after the frame is taken;
- upload the cropped PNG as a raw Blob, cap its dimensions and bytes, and store it atomically at
  `reviews/v<n>/images/<comment-id>.png` rather than base64-encoding it into annotations;
- carry the image path in annotations, `feedback.md`, the pending record and `claim` output, and make
  the agent workflow inspect every listed image before acting;
- fail clearly if an attached image was not durably saved; do not silently send text without it;
- leave Artifact/copy mode unchanged rather than inflating the self-contained bundle with images.

This is intentionally a wishlist record, not planned work. Directly injecting the image into a
host-specific LLM API is outside the lightweight design; the portable version persists the file and
makes it required review material.

## Still open

- **Two lines owed to [`vstack-template-base`](https://github.com/Cavalry-Collective/vstack-template-base)**,
  a different repo, so they can't be written from here. Both are small, and both are about the
  template's own docs agreeing with what the stack writes into it:
  1. `specs/README.md` — name `product.md` and `requirements.md`. The convention there describes only
     dated per-feature files; `design/CLAUDE.md` already refers to *"the requirements spec under
     `specs/`"*, so the extension is defensible, it is just undocumented.
  2. `design/CLAUDE.md` and the `design/README.md` inventory column — say **wireframe**, per the
     decision below. Today they say *prototype*.
- ~~**The `phase-build-*` trio is the least specified part of this.**~~ Resolved by building it: the
  trio **is one `phase-build` skill** with three tabs. What it adds over the template's `CLAUDE.md`
  contracts is the visible, adjustable plan and the live build record — the contracts still govern
  *how* each node is built (and in a non-template repo, the codebase's own conventions do).
- ~~**Wireframe or mockup?**~~ **Settled: wireframe**, everywhere the stack speaks — the skill names,
  the copy, this repo's `docs/wireframes/`, and the default output folder a standalone run writes to.
  One word for the thing, whatever its fidelity: a page you operate, argue with, and sign off. The
  skills still *answer* to "mockup" and "prototype" — both stay in the trigger descriptions, because
  that is what people type. The template repo is the last place the two vocabularies disagree; the
  line it needs is listed at the top of this section.
- **How far `start` should go on its own.** Day-1 steps 11–13 — protect `main`, stand up staging,
  confirm CI green — are GitHub settings and a live push, not file edits. A skill probably shouldn't
  do those unasked, so `start` may have to end by *handing back a checklist* rather than claiming the
  repo is finished. That's the seam to watch now that everything else is merged into one stage.
- **`start` is now a long stage.** Clone, the form, a rebrand, and thirteen checklist steps is a
  lot to hold in one skill — and it now carries three modes besides. If it needs splitting later, the
  honest seam is *before* vs *after* the first green CI run — not stack-vs-everything-else, which is
  the split that just got removed.
- **How `go` handles a dirty or half-run stage.** `stage` records the last *completed* stage, but
  nothing records "started and abandoned". The shipped `go` mentions a dirty tree when it sees one,
  but the state file still can't represent it.
- **The snapshot catalog can drift.** Fresh-mode `start` now fetches the template's live `stacks/` +
  `add-ons/` listing from GitHub before falling back to the table inside `chooser-server.mjs`, so
  drift only bites offline or rate-limited. When it does bite, a pack added upstream isn't offered
  until the table is updated; the reconcile step after cloning catches the mismatch, but catching is
  not the same as offering. Blurbs for unknown packs are also thinner from the listing than from a
  clone — the README fallback needs the files on disk.
- ~~**Spec Kit.**~~ Answered by the tool-agnostic principle: **nobody owns `specs/`.** vstack writes
  plain markdown and its own `.vstack/` state, reads anything, and touches only the files it wrote —
  the template's `speckit-*` skills and this chain can live in one repo without either yielding.
  (The per-tool coexistence comparison for the README is still on the wishlist, item 6.)
- ~~**What "existing" means for the `phase-build` colouring.**~~ Resolved, the honest way: **read
  from the codebase**, at plan time, with the read stamped on the board. Never from a previous
  phase's plan.
- **The graph layout dependency.** Partially settled: the build board ships the wireframe's hand-rolled
  layered **tree** layout, which is enough for endpoints, the atomic tree, and infra as shipped. A
  general dependency *graph* (infra nodes with multiple parents) still has no answer, and neither
  does `requirements`' free-form concept map.
- **Where prose still belongs.** If the artifact is the source of truth and the markdown is
  generated, then `specs/requirements.md` and the feature specs become outputs, not inputs. That's
  probably right, but it means a human editing the markdown directly is editing a generated file —
  and something has to say so, loudly, at the top of it.
- ~~**`phase-preview`'s slider changes its output shape.**~~ Resolved by not changing it: the
  per-phase files stay the artifact and the build stages still consume them. The scrubber is a
  *view* generated from those files — `<name>-phases.html`, safe to delete and rebuild.

## If this gets built

Rough order, each step independently useful:

1. ~~**`phase-preview`**~~ — **built**, ahead of the rest, because it needs nothing from the chain.
   The slider landed later, once the scrubber was a shell component — which is the argument for
   shared components made concretely: the last stage to want one was the cheapest to build.
2. ~~**`init`**~~ — **built**, chooser and all, and later grown into the multi-step `start` (four
   steps, three modes, `specs/product.md`). It **did not need the shared live-link engine**: the
   form asks one question once, so it owns a ~250-line one-shot server instead of a third of a
   300-line sync engine. That is a real limit on the "one engine" argument below — it applies to
   stages that hold a conversation, not to stages that ask a question.
3. ~~**The shared live-link engine**~~ — **built**, as `plugins/vstack/lib/json-bridge.mjs`,
   generalized from `bridge.py` (seq waiter, SSE push with echo suppression, token, injection,
   idle-close) plus a `patch` subcommand for per-node progress and an on-disk version history
   (`/history`, `/history/<n>`) behind the spec page's timeline. `spec`, `phase-build` and
   `user-story-map` run on it; `bridge.py` is gone. `wireframe` keeps `review-server.mjs` — see
   *One engine, not eight* for why that one is not a duplicate.
4. ~~**`next`**~~ — **built**, as `/vstack:go`, with inference mode on top of the planned
   state-file reading. It proves the `pipeline.json` schema everything after depends on.
5. **`requirements`**, from another round of design — the v6 wireframe was parked, not approved. It is
   also the first mind map, so the graph-layout question gets settled here.
6. ~~**The `ui-review` → `wireframe` rename**~~ — **done**. Footers still to come, once the state file has stopped moving.
7. ~~**`spec`**~~ — **built**, the drill-down on the shared engine. Note for when `requirements`
   lands: `spec` currently consumes the wireframe + `product.md` + conversation; wiring it to a
   concept graph is a change to its §1 draft step, not to its page.
8. ~~**`phase-build`**~~ — **built**, as one skill, with *existing vs new* answered (read from the
   codebase at plan time) and the live build view from the new wishes delivered on the same board.

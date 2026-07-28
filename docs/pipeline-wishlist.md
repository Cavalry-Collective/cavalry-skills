# Wishlist — the Cavalry pipeline

**Status: proposal, with two stages built.** This repo ships four skills today — `ui-review`,
`user-story-map`, `phase-wireframe` (stage 5) and `init` (stage 0). This document describes what it
would take to turn them into links in a chain that runs from a raw idea to shipped code, and records
the design decisions already made so they don't have to be re-argued.

**Mockups for the unbuilt stages live in [`mockups/`](mockups/)** — `requirements`, `spec`, the phase
slider and the build maps. They are reviewed designs, not implementations; `init`'s chooser was one of
them until it became `plugins/cavalry/skills/init/assets/chooser.html`.

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
drag cards around, the wireframe is a page you comment on directly, and `init` is a chooser you tick.
`phase-wireframe` is built but not yet visual. This section is the plan for the rest.

Three rules fall out of it:

- **The artifact is the source of truth, not a view of one.** The story map already works this way —
  its JSON *is* the plan, and any markdown is generated from it. Every visual stage inherits that.
  A picture generated *from* a document drifts from it; a document generated *from* the picture
  can't.
- **No approve/reject.** It's tedious and it produces false approval — the same reason `ui-review`
  has no resolve button today. You change what's wrong and the change *is* the feedback.
- **Edits flow back without copy-paste.** Both live-link mechanisms in this repo already do this;
  see *One engine, not eight* below.

## The stages

```
  /cavalry:next  ←  always answers "what now?"

   0  init              clone the template, choose the stack + add-ons, delete the rest
   1  requirements      specs/requirements.md
   2  wireframe      ◆  design/<feature>.html            ──┐ review loop
   3  spec              specs/YYYY-MM-DD-<feature>.md      │
   4  user-story-map ◆  specs/story-map.json               │
   5  phase-wireframe    design/phase-<n>/<feature>.html ──┘ review loop
   6  phase-build-api    apps/backend, db/migrations  ┐
   7  phase-build-ui     apps/frontend                ├ repeat per phase
   8  phase-build-infra  infra/                       ┘

  ◆ = works standalone, with no pipeline and no template
```

Everything from stage 5 on is named `phase-*`, because everything from stage 5 on happens **once per
release phase**. That's the part of the chain people lose track of, so the names carry it.

| # | Skill | Would read | Would write |
|---|---|---|---|
| — | `next` | `.cavalry/pipeline.json` | nothing — reports where you are, offers to run the next stage |
| 0 | `init` | the cwd, `stacks/`, `add-ons/` | a fully instantiated repo — template cloned, one pack kept, add-ons chosen, toolchain filled, design guide confirmed (the whole Day-1 checklist) + `.cavalry/pipeline.json` |
| 1 | `requirements` | the conversation, any brief or notes | `specs/requirements.md` |
| 2 | `wireframe` ◆ | `specs/requirements.md`, `design/tokens.css`, `design/CLAUDE.md` | `design/<feature>.html`, an inventory row in `design/README.md` |
| 3 | `spec` | `design/<feature>.html`, `specs/requirements.md` | `specs/YYYY-MM-DD-<feature>.md`, fills that row's *owning spec* |
| 4 | `user-story-map` ◆ | `specs/*.md` | `specs/story-map.json` + `specs/story-map.html` |
| 5 | `phase-wireframe` | `specs/story-map.json`, `design/<feature>.html` | `design/phase-<n>/<feature>.html` |
| 6 | `phase-build-api` | the phase-N slice of each spec | `apps/backend/`, `db/migrations/` |
| 7 | `phase-build-ui` | the phase-N slice, `design/phase-<n>/` | `apps/frontend/` |
| 8 | `phase-build-infra` | the phase-N slice | `infra/` |

`init` and `next` are additions to the original sketch. `init` is what makes "the chain always starts
from the template" true without dead-ending someone in a bare directory; `next` is the entire answer
to the problem at the top of this page. **`stack` is no longer a separate stage** — it folded into
`init`, which is where the whole Day-1 checklist now lives (see below).

### The phase loop

Stages 0–5 would run **once** — stage 5 included, producing one entry per phase in a single pass, so
the build loop never goes back for a design. (The final phase usually *is* the base wireframe; record
it as that path rather than copying the file.)

Stages 6 → 7 → 8 then run **in that order within a phase**, and the trio repeats per phase:

```
once ──  init → requirements → wireframe → spec → user-story-map → phase-wireframe
                                                                          │
per phase ────────────────────────────────────────────────────────────────┤
                                                                          ▼
            ┌──────► phase-build-api ──► phase-build-ui ──► phase-build-infra ──┐
            │                                                                   │
            └────────────────── phase += 1, while phases remain ◄───────────────┘
```

**`phase-build-infra` would own the phase counter** — on completing phase N it sets `phase: N + 1`,
or `stage: "done"` if N was the last phase. No other stage touches it after `user-story-map` sets it
to `1`. Without this rule nobody advances the phase and the loop stalls silently.

### Stage 5 — built

`phase-wireframe` is the stage that earns the chain its keep: it takes a design everyone has already
signed off and **subtracts** it to each release phase, so the phase-1 build target looks exactly like
the approved design minus what isn't in phase 1 yet. It is the one stage with no equivalent
elsewhere, and it needs nothing from the pipeline — a base mockup and a set of phases are enough —
so it was built first. See `plugins/cavalry/skills/phase-wireframe/`.

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

**It is not yet visual.** It writes one file per phase and hands each to `ui-review` separately —
correct output, wrong shape for the question people ask. The phase slider is the fix; see
*What each stage looks like* below.

## What each stage looks like

| # | Stage | What you see | What you do to it |
|---|---|---|---|
| 0 | `init` ✓ | a **stack & add-on chooser** — cards in a cart | pick one pack, tick add-ons, watch what gets deleted |
| 1 | `requirements` | a **live concept map**, built as you write | drag cards anywhere; link them; label the links |
| 2 | `wireframe` ✓ | the page itself, in a review workspace | comment straight on it |
| 3 | `spec` | a **drill-down tree**, collapsed to headlines | expand, annotate, delete, add — no approve/reject |
| 4 | `user-story-map` ✓ | the grid of activities × phases | drag cards to re-slice |
| 5 | `phase-wireframe` | the page, with a **phase slider** under it | drag the slider to watch phases appear |
| 6 | `phase-build-api` | a **mind map of the endpoints** | adjust before the build starts |
| 7 | `phase-build-ui` | a **mind map of the atomic-design tree** | adjust before the build starts |
| 8 | `phase-build-infra` | a **mind map of the resources** | adjust before the build starts |

✓ = already built and already visual.

### 0 · `init` — the chooser · **built**

*Shipped as `plugins/cavalry/skills/init/`. What the stage does is under
[Stage 0](#stage-0--init-which-is-the-whole-day-1-checklist); this is what it looks like while doing it.*

The two interviews become one page instead of a wall of questions. Stack packs as cards (pick one),
add-ons as cards (pick any) — **shopping-cart style**, with a running panel showing what the project
will contain and, just as important, **what is about to be deleted**. Since deleting *is* the
adoption mechanism, seeing the delete list before confirming is the whole safety mechanism.

Each card leads with its product-shaped question, not its name — *"several organisations sharing one
deployment, with strictly separated data?"* rather than *"multi-tenancy"*. The name is the small
print. Confirm once, and `init` performs every deletion and fills the toolchain.

### 1 · `requirements` — the live concept map

*Design reviewed to v6 in [`mockups/requirements-map.html`](mockups/requirements-map.html); **not
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

### 3 · `spec` — the drill-down

The complaint this fixes: a spec today is a long document nobody reads.

So it opens **collapsed to headlines** — goals and story titles only, one screen, no scrolling. Click
a story to open its acceptance criteria; click a criterion to see how it will be verified. You go
deeper only where you care, and depth is never in your way.

- **Notes attach anywhere**, at any level.
- **Delete and add inline** — a story that shouldn't exist goes away, a missing one gets typed in.
- **No approve/reject.** Editing it *is* approving it.
- **Live sync both ways**, like the wireframe: your changes reach the session, and when the spec is
  regenerated the page offers a refresh rather than yanking the tree out from under you.

### 5 · `phase-wireframe` — the phase slider

Today it writes one file per phase and hands each to `ui-review` separately. That's the wrong shape
for the question people actually ask, which is *"what changes between phases?"* — and you can't see
that by opening three files in three tabs.

Instead: the page in its own frame, **a slider along the bottom, one stop per phase**. Drag it and
the design fills in as features arrive. Phase 1 → 2 → 3 becomes a motion you can scrub, so what each
phase adds is obvious at a glance.

`ui-review` already ships almost exactly this — its version timeline is a draggable handle that
scrubs published versions. Same interaction, different axis. Build it once (see below).

### 6–8 · `phase-build-*` — the mind maps

The same shape three times, over three different subjects:

| Stage | The map is |
|---|---|
| `phase-build-api` | the endpoints — resources, routes, and what they return |
| `phase-build-ui` | the atomic-design tree — atoms → molecules → organisms → pages |
| `phase-build-infra` | the resources to be provisioned, and what depends on what |

In every case you see it **before the build begins** and adjust it — this is the cheapest possible
moment to move an endpoint or collapse two components, and the last moment before it costs code.

**From phase 2 on, the map is colour-coded: what already exists vs what this phase adds.** That's the
feature that makes the later phases legible — you're never looking at the whole system wondering
which part is this week's work.

That colouring is also the hard part, and worth being honest about: *existing* has to mean **what is
actually in the codebase**, read from it, not what a previous phase's plan said would be built. A map
that colours from the plan will confidently lie the first time a phase ships late or partial.

## One engine, not eight

Six stages above want the same three components. Building them per-skill would be six copies of the
hard parts and six places for them to drift.

**The live link.** This repo already has two implementations of it — `ui-review`'s SSE server
(`review-server.mjs`) and the story map's `bridge.py`. They do the same job: serve a self-contained
page on `127.0.0.1`, wake the session when the user sends, push updates back as an offered refresh
rather than a silent overwrite, and shut down cleanly when the tab closes. **Writing a third and
fourth is the mistake to avoid.** One shared engine, taught to serve any of these pages, is the
single highest-leverage thing to build in this whole plan — and it should probably happen before any
new visual stage, not after two more copies exist.

**The mind map.** Three stages (6–8) plus `requirements` want a directed graph with inline editing,
drag-to-reparent, and a two-state colour scheme. That is one component fed four datasets, not four
components.

**The scrubber.** `phase-wireframe`'s phase slider and `ui-review`'s version timeline are the same
control over different axes.

One constraint shapes all three: these pages are **self-contained, no external requests** — it's what
lets the same file work served locally, opened off disk, and published as an Artifact under CSP.
Every existing skill in this repo is dependency-free for that reason. A graph layout engine is the
first thing in this plan that genuinely tempts a dependency, and the honest options are to hand-roll
a simple layered layout or to inline a small one. Worth deciding deliberately rather than discovering
it halfway through building `requirements`.

## Standalone stays first-class

One rule would decide the mode:

> **`.cavalry/pipeline.json` exists → pipeline mode. It doesn't → standalone.**
> `wireframe` and `user-story-map` never create it. Only `init`, `requirements` and `next` bring the
> pipeline into being.

| | Pipeline mode | Standalone |
|---|---|---|
| Inputs | `artifacts.*` from the state file | whatever the user says, plus any file they point at |
| Output path | `design/<feature>.html`, `specs/story-map.*` | **unchanged from today** — wherever the skill already writes when run cold |
| Design source | the template's `design/tokens.css` + `design/CLAUDE.md` | today's priority order — reference site → screenshots → project design system → ask |
| State | rewrites `.cavalry/pipeline.json` | writes none |
| Ending | *"Next: `/cavalry:spec` — shall I run it?"* | just the result. **One** closing line may mention the chain exists; it never proposes the next stage |

The other six stages would be pipeline-only: run one cold and it offers `/cavalry:init` rather than
improvising a project structure.

## Stage 0 — `init`, which is the whole Day-1 checklist

The chain would run on a repo instantiated from
[`cavalry-template-spa`](https://github.com/Cavalry-Collective/cavalry-template-spa) — always. Its
`design/`, `specs/`, `stacks/`, `add-ons/` and `CLAUDE.md` contracts are what the later stages read
and write; without them stages 6–8 have no architecture to build against.

`init` clones it and then **interviews you until the template is a project**. There is no separate
`stack` stage: choosing the stack was never a thing you could do halfway through, and splitting the
13-step Day-1 checklist across two skills only created a seam where steps could fall through.

1. **Clone** `cavalry-template-spa` and open the workspace *(Day-1 1–3)*.
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
then picks up the survivor automatically, with no generated file to drift. So `init` really does end
by removing most of what it just cloned — that's the design, and it's worth saying out loud before
someone stops it mid-delete.

**The cost of merging, stated plainly.** `stack` used to sit at position 6, *after* specs existed —
so the choice was informed by what was actually being built. Asking at `init` means choosing before
anyone has written a requirement. Two things make that survivable, and they should be built in:

- Ask **product-shaped questions** when interviewing in conversation. Someone can answer "do several
  companies share one deployment?" on day zero; they can't answer "do you want the multi-tenancy
  add-on?". (The chooser page shows names and tags instead — see step 4.)
- **Adoption stays reversible.** An add-on is a directory — a later stage that discovers a missed
  capability can restore it from the template, and `init` should say so rather than implying the
  interview is one-shot. The stack pack is the genuinely expensive one to change late; weight the
  questioning accordingly.

## The handoff file

`.cavalry/pipeline.json` at the project root, **committed** — a project record, not scratch.

```json
{
  "version": 1,
  "project": "cavalry-hiring",
  "stage": "spec",
  "phase": 1,
  "artifacts": {
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
| `stage` | the **last completed** stage id. `next` proposes its successor. `"done"` is terminal |
| `phase` | the phase in flight. `null` until `user-story-map` sets it to `1`; `phase-build-infra` advances it |
| `artifacts.*` | repo-relative paths, always. A stage writes only the keys it produced |
| `history[]` | append-only, one entry per completed stage |

Rules worth pinning now:

- **Preserve unknown keys** on rewrite — a newer skill's field must survive an older one's write.
- **Never invent a path.** A stage records only what it wrote; a missing key means the producing
  stage hasn't run, and that absence is the signal the next stage acts on.
- **Append vs. replace.** For the per-feature stages (`wireframe`, `spec`), re-running on a *new*
  feature appends to `artifacts.wireframes[]`; re-running on an *existing* one replaces that entry in
  place. Match on `feature`, never on array position.
- Stages stay **re-runnable and skippable**. `next` proposes the successor; it never refuses a jump.

## The footer every SKILL.md would end with

Fixed shape, so the chain is visible from inside any stage. On a dual-mode skill the standalone
escape comes first, because that's the common case:

```markdown
## State & handoff

**No `.cavalry/pipeline.json`?** You're standalone — everything above still applies. Take the brief
from the user, write where they ask, and stop when the page is right. Skip the rest of this section.

- **Read** `.cavalry/pipeline.json` → `artifacts.requirements`. Present but the key is missing —
  the previous stage hasn't run; offer `/cavalry:requirements` rather than guessing.
- **Write** `design/<feature>.html`, the `design/README.md` inventory row, and
  `artifacts.wireframes[]` + `stage: "wireframe"`.
- **Next** — `/cavalry:spec` turns this wireframe into a written spec. Offer to run it; don't ask
  whether to continue.
```

Each skill would restate its own lines rather than reading a shared contract file — a few lines of
duplication buy robustness against a skill being invoked cold, which for the dual-mode two is normal.

**Offer, don't interrogate.** A stage ends by naming its successor and offering to run it. It doesn't
ask *"shall I continue?"* in the abstract, and it doesn't run the next stage unasked.

## Renames this would require

| Today | Would become | Cost |
|---|---|---|
| `ui-review` | `wireframe` | breaks `/cavalry:ui-review` for anyone who installed it; needs a major version bump |
| `user-story-map` | *unchanged* | none — it keeps its name and gains only the handoff footer |

Only one skill moves. Its engine would move **unchanged** — `review-server.mjs`, `workspace.html`,
`bundle-artifact.mjs`. The internal paths (`.ui-review/`, `ui-review:*` localStorage keys) would
deliberately keep the old names: renaming them breaks in-flight reviews for no user-visible gain.
Worth a line in the SKILL.md so it doesn't read as an oversight.

*This was trial-built once and reverted. The rename is mechanical and the engine smoke-tested clean
from a new path — publish, status, artifact bundle, and the story-map bridge serving over HTTP. The
rename is not the risky part.*

**One thing the new name changes.** `ui-review` today does two jobs: generate a page, and run the
comment loop over any HTML file. `wireframe` describes the first well and the second not at all — so
the description would have to carry the review triggers explicitly ("review, annotate, mark up or
comment on a page"), or the review loop becomes hard to reach for someone who just wants to critique
an existing screen. Worth watching after the rename lands.

## Two indexes that must agree

`design/README.md` carries the template's inventory table — *screen · prototype file · owning spec* —
the **human** index; `artifacts.wireframes[]` is the **machine** one.

- `wireframe` adds the row when it creates a page, leaving *owning spec* blank.
- `spec` fills that row's *owning spec* when it writes the spec.
- **Phase wireframes get no row.** The table indexes *screens*, and a phase wireframe is the same
  screen; its path is `design/phase-<n>/<feature>.html` by convention, recorded under
  `wireframes[].phases`.

## Still open

- **`specs/requirements.md` is an extension** to the template's convention, which describes only
  dated per-feature files. The template's `design/CLAUDE.md` already refers to *"the requirements
  spec under `specs/`"*, so the name is defensible — but it wants a line in
  `cavalry-template-spa`'s `specs/README.md`, which is a change to a different repo.
- **The `phase-build-*` trio is the least specified part of this.** "Build the phase-N slice of the
  specs" is a sentence, not a contract. What does `phase-build-api` do that the template's
  `CLAUDE.md` contracts don't already say? If the answer is "not much", these three might be one
  `phase-build` skill that takes the area as an argument, or might not need to exist at all.
- **Wireframe or mockup?** The template's `design/` folder, its `CLAUDE.md`, and its inventory table
  all say *prototype* and *mockup*, and the deliverable described there is a fully interactive,
  token-styled page — closer to a mockup than a wireframe. The skill name and the template's
  vocabulary would disagree. Either is fine, but they should be reconciled deliberately rather than
  left to drift.
- **How far `init` should go on its own.** Day-1 steps 11–13 — protect `main`, stand up staging,
  confirm CI green — are GitHub settings and a live push, not file edits. A skill probably shouldn't
  do those unasked, so `init` may have to end by *handing back a checklist* rather than claiming the
  repo is finished. That's the seam to watch now that everything else is merged into one stage.
- **`init` is now a long stage.** Clone, two interviews, a rebrand, and thirteen checklist steps is a
  lot to hold in one skill. If it needs splitting later, the honest seam is *before* vs *after* the
  first green CI run — not stack-vs-everything-else, which is the split that just got removed.
- **How `next` handles a dirty or half-run stage.** `stage` records the last *completed* stage, but
  nothing records "started and abandoned".
- **Spec Kit.** The template ships `speckit-*` skills. This chain deliberately ignores them and uses
  the plain `specs/` convention. If both live in one repo, which one owns `specs/`?
- **What "existing" means for the `phase-build-*` colouring.** Read from the codebase (true, harder,
  and the only version that survives a phase shipping partially) or from the previous phase's plan
  (easy, and wrong the first time reality diverges). This is the single biggest unanswered question
  in the visual layer.
- **The graph layout dependency.** Self-contained pages can't fetch a library, so the mind map needs
  a hand-rolled layout or an inlined one. Hand-rolling is fine for a tree and gets hard fast for a
  general graph — which is exactly what `phase-build-infra`'s dependencies are.
- **Where prose still belongs.** If the artifact is the source of truth and the markdown is
  generated, then `specs/requirements.md` and the feature specs become outputs, not inputs. That's
  probably right, but it means a human editing the markdown directly is editing a generated file —
  and something has to say so, loudly, at the top of it.
- **`phase-wireframe`'s slider changes its output shape.** It currently writes one file per phase,
  which is what the build stages consume. A scrubber over all phases is a different artifact; the
  per-phase files still need to exist underneath it.

## If this gets built

Rough order, each step independently useful:

1. ~~**`phase-wireframe`**~~ — **built**, ahead of the rest, because it needs nothing from the chain.
   Not yet visual; the slider is still to come.
2. ~~**`init`**~~ — **built**, chooser and all. It **did not need the shared live-link engine**: the
   chooser asks one question once, so it owns a ~150-line one-shot server instead of a third of a
   300-line sync engine. That is a real limit on the "one engine" argument below — it applies to
   stages that hold a conversation, not to stages that ask a question.
3. **The shared live-link engine**, extracted from `review-server.mjs` and `bridge.py` rather than
   designed fresh. Nothing user-visible ships, and every stage after this gets cheaper. Doing it
   later means porting however many copies exist by then.
4. **`next`** — small, and it proves the state file that everything after depends on.
5. **`requirements`**, from another round of design — the v6 mockup was parked, not approved. It is
   also the first mind map, so the graph-layout question gets settled here.
6. **The `ui-review` → `wireframe` rename + footers**, once the state file has stopped moving.
7. **`spec`** — the drill-down. Note it must consume whatever `requirements` ends up emitting; the
   current mockup still assumes a feature list rather than a concept graph.
8. **`phase-build-*`**, last, and only once *existing vs new* has an answer. Three stages sharing one
   mind map by then, so the marginal cost of the third is small.

---
name: spec
description: Turn a wireframe and everything already agreed into a written spec in traditional agile shape — an initiative broken into epics, epics into user stories with acceptance criteria, and themes as the labels that span them — presented as an interactive drill-down tree the user prunes, edits and annotates in the browser, with a plain-markdown spec generated from it. Use when the user wants a spec, an initiative or epic broken into user stories, acceptance criteria, to formalise what a mockup does, or to review and edit a spec visually.
---

A spec in traditional agile shape — the full Atlassian ladder, **initiative → epics → user
stories**, with **themes as the labels that span them** — that opens **collapsed to headlines**:
the initiative's goal, its epics, their story titles; one screen, no scrolling. Click a story for
its acceptance criteria; click a criterion for how it will be verified. Themes are *"large focus
areas that span the organization"* — **tags, not work items**: a catalog shown on the initiative,
toggled onto the stories they span (auditability, performance, compliance). The complaint this
fixes: a spec today is a long document nobody reads.

```
wireframe + product.md + the conversation ──► tree JSON ──► drill-down page ──► edits & notes ──┐
                          ▲                                                                     │
                          └────────── you apply it, reply in notes, regenerate ◄────────────────┘
                                             │
                          specs/YYYY-MM-DD-<feature>.md   ← generated every round
```

**The tree is the spec.** `.vstack/specs/<feature>.json` is the source of truth; the markdown under
`specs/` is generated from it, never edited by hand. **There is no approve/reject** — the user
changes what's wrong, and the change is the feedback.

## 1 · Draft the tree

Read whatever exists — the wireframe (`design/<feature>.html` or wherever it lives),
`specs/product.md`, `specs/requirements.md`, and the conversation. Then write
`.vstack/specs/<feature>.json`:

```json
{
  "feature": "candidate-pipeline",
  "title": "Candidate pipeline",
  "goal": "The epic statement — one sentence on what the user gets.",
  "source": ["design/candidate-pipeline.html", "specs/product.md"],
  "themes": ["Auditability", "Reporting"],
  "epics": [
    { "id": "e1", "title": "Pipeline operations", "stories": [
      { "id": "s1", "title": "See everyone who applied to a role",
        "themes": ["Reporting"], "notes": [],
        "crit": [
          { "id": "c1",
            "text": "The list opens newest-first and shows name, stage and days waiting.",
            "verify": "Open /roles/42 — top row is the most recent application.",
            "notes": [] }
        ] }
    ] }
  ]
}
```

Traditional agile, mapped (per Atlassian's stories < epics < initiatives, with themes spanning
them): the document **is one initiative** (`title` + `goal`); `epics` are its bodies of work, each
holding its user stories; `doc.themes` is the initiative's **theme catalog** — plain labels — and
each story's `themes` array tags it with the ones it serves. **The catalog is edited here, not on
the page** — the page shows themes read-only and toggles them per story; add or rename themes in
this JSON when the conversation calls for it. Themes carry no criteria of their own: a
cross-cutting *requirement* still lives as a criterion in every story it constrains; the theme is
how you see the span. A small feature is one epic; don't invent a second epic to look thorough.

- Every criterion carries **`verify`** — the concrete check, with real values, not a restatement of
  the criterion. If you can't write how it's checked, the criterion isn't done.
- **No priorities here.** Which stories land first is a phasing decision, and phasing is
  `/vstack:user-story-map`'s job — the spec says *what*, the story map says *when*. Ids are stable —
  never renumber existing ones on a rewrite.
- Keep the theme catalog short — a handful of focus areas, not a folksonomy. A theme only one story
  wears isn't spanning anything.
- **Keep the first pass lean.** The loop is how it gets rich; a bloated v1 wastes the user's first
  round on deletions.

## 2 · Serve it

```bash
SKILL=<this skill dir>
LIB="$SKILL/../../lib"
DOC=.vstack/specs/<feature>.json
node "$LIB/json-bridge.mjs" serve --json "$DOC" --template "$SKILL/assets/spec-tree.html" --port 7791
```

Start it with **`run_in_background: true`**. It prints the URL (with its token) — tell the user to
open it. Then arm the waiter with **`run_in_background: true`**, carrying the seq the server printed:

```bash
BRD=.vstack/specs/.vstack-bridge
S="$BRD/<feature>.seq"; U="$BRD/<feature>.url"
N=<the seq value printed when you armed — carry it forward, never re-read it on re-arm>
until [ ! -f "$U" ] || [ "$(cat "$S" 2>/dev/null)" != "$N" ]; do sleep 2; done
if [ -f "$U" ]; then echo "SENT seq=$(cat "$S")"; else echo "LINK CLOSED"; fi
```

`SENT` means an edited tree landed in the JSON; `LINK CLOSED` means the tab went away — say so and
stop serving. **Never re-read the seq when re-arming** — a send that lands between rounds would be
swallowed; use the seq printed by the previous waiter's output.

## 3 · The round

On `SENT`, read the JSON back:

- **Edited text is the new truth.** Titles, criteria, verifies, the goal, priorities, deletions,
  additions — apply them silently. Don't re-litigate a deletion.
- **Notes are clarifications** — the page presents every note as one kind of thing: a question on
  the spec, with a place to answer. A user-written clarification is the user talking to you: answer
  it by **fixing the spec and removing the note**. When something genuinely needs the user's
  decision, leave your own clarification (`who: "Claude"` for provenance; the page renders all
  clarifications identically).
- **Prefer multiple choice when asking.** A clarification can carry
  `"options": ["HR owns the list", "Admins only", "Either, behind a permission"]` — the page renders
  them as radio choices and writes the pick into `"answer"`; without options it offers a free-text
  answer line. **An answered clarification is a decision**: apply it and remove the note in the next
  round.
- Rewrite the JSON (the page offers a *Refresh* bar — it never yanks the tree mid-edit), regenerate
  the markdown (§4), re-arm the waiter, and say in a few lines what changed. Don't ask "shall I
  continue?" — the loop is the point.

## 4 · Generate the markdown, every round

`specs/YYYY-MM-DD-<feature>.md` — date fixed on first creation; later rounds update the same file.
Re-running on a feature that already has a dated spec updates that file, never a second one.

```markdown
<!-- Generated from .vstack/specs/<feature>.json — edit on the spec page (/vstack:spec), not here. -->
# Initiative — <title>

<goal>

**Themes:** <theme> · <theme>

## Epic — <epic title>

### <story title>  `<theme>`
- <criterion>
  - *Verified by:* <verify>
...
```

The header warning matters: this file is an export. A human editing it directly is editing a
generated file, and the next round will overwrite them.

## Notes

- **Never edit `assets/spec-tree.html` or `lib/json-bridge.mjs`** to fit a project — they're the
  engine. Only the JSON document is yours.
- The bridge binds `127.0.0.1` and dies when the tab closes (90s grace). Port busy → another spec
  page is up; pass `--port`.
- One review is one feature. Several features means several JSON files served one at a time.
- **Works beside any other tooling.** vstack writes `.vstack/` and plain markdown under `specs/`,
  and touches nothing else — no `.specify/`, no other tool's state, no hooks, no config. If the
  project also uses speckit or another spec tool, both coexist: vstack does not own `specs/`, it
  owns only the files it wrote.

## State & handoff

**No `.vstack/pipeline.json`?** You're standalone — everything above still applies. Take the brief
from the user, write the markdown where they ask (default `specs/`), and skip the rest.

- **Read** `.vstack/pipeline.json` → `artifacts.wireframes[]` for the feature's page,
  `artifacts.product` for the constitution. A missing wireframe isn't a blocker — a spec can come
  from conversation alone; say what it's based on.
- **Write** `artifacts.specs[]` (append for a new feature; replace in place for an existing one —
  match on feature, never on array position) and `stage: "spec"`. If the template's
  `design/README.md` inventory exists, fill the feature's *owning spec* cell.
- **Next** — `/vstack:user-story-map` slices the specs into release phases. Offer to run it; don't
  ask whether to continue.

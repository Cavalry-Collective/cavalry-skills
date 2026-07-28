---
name: phase-wireframe
description: Take one signed-off UI mockup and cut it down into a series of phased mockups — one per release phase, each showing only what exists by that phase, with the layout untouched. Use when the user wants a Phase 1 / MVP version of an existing mockup, phased or staged mockups, a mockup sliced by release phase or story map, or wants to see what a screen looks like before later features land.
---

One mockup in, one mockup per phase out. Each phase file shows everything available **by** that phase
and nothing that isn't, in exactly the positions the approved design already put them — so a phase
mockup is the real build target for that release, not a redrawing of it.

```
base.html ──┬──► phase-1/base.html    only what ships in phase 1
            ├──► phase-2/base.html    phase 1 + phase 2
            └──► phase-3/base.html    phase 1 + 2 + 3   ( = the base, if phases cover it all )
```

**Subtract only.** Nothing is moved, resized, restyled or repositioned; nothing new is invented. That
is the entire discipline of this skill, and §4 proves it mechanically rather than trusting the eye.

## 1 · Resolve the two inputs

**The base mockup** — one self-contained HTML file. If the user hasn't named one, ask; don't guess
among the files in `design/`. Never work from an already-phased file: every phase is cut from the
original.

**The phases, and what belongs to each.** In priority order:

1. A **story map** (`*.json` from `/cavalry:user-story-map`) — `phases[]` gives the order and goals,
   `stories[]` give what lands when. This is the best input; ask for one if a story map exists.
2. A **spec** with P1/P2/P3 priorities, or a roadmap.
3. **The user tells you** the phases in the conversation.

If none of those exist, stop and ask — inventing a release plan is not this skill's job.

## 2 · Write the phase plan before touching any HTML

Open the base and inventory **every** element, component and interaction in it. Assign each one the
**earliest phase it exists in**. Write that out and show the user before generating anything:

```markdown
| Element | Earliest phase | Why |
|---|---|---|
| Candidate table + search | 1 | "Search candidates by name" |
| Bulk-select toolbar | 2 | "Move several candidates at once" |
| "Ask AI" button + drawer | 3 | "Summarise a candidate with AI" |
| Export button | — | not in any story — flag it |
```

This step is the one that makes the rest mechanical. Doing it up front means each phase is a lookup
rather than a fresh judgement call, and it surfaces the two things worth a conversation:

- **Elements no story covers.** Say so rather than silently keeping or cutting them. Chrome that
  every phase needs (nav, page title, empty states) is phase 1 by default — call that out too.
- **Phase-1 features gated behind later ones.** These need the skeleton rule in §3; find them now,
  not mid-edit.

Confirm the plan, then generate. If the user re-slices the story map afterwards, come back here.

## 3 · Generate the phases, one at a time, in order

For each phase 1, 2, 3 … **in order**, and only starting the next once the current one is written,
checked and shown:

1. **Start from the original full mockup.** Never from the previous phase's output — errors compound.
2. **Subtract every element, component and interaction that does not belong to the current phase or
   any earlier phase.** Phases are cumulative: phase 2 shows phase 1 *and* phase 2.
3. **Keep the exact same layout, spacing, alignment, sizes and visual hierarchy.** Do not move,
   resize, restyle or reposition any remaining element. Leave the stylesheet exactly as it is —
   rules that no longer match anything are fine and expected.
4. **Fully implement the features available in this phase** (and earlier). What survives still works;
   a control that can't act is removed, not left dead.
5. **A current-phase feature gated behind a later-phase one** stays in its original place, and the
   later-phase gate is replaced with the absolute minimum skeleton — an empty container, a disabled
   placeholder, or a plain frame — so the current-phase feature stays visible and reachable.
   **Every skeleton element carries `data-phase-skeleton`**, which is what lets §4 tell an allowed
   placeholder apart from an invented element.
6. **Do not invent new elements or redesign anything. Only subtract.**

Write each to `<dir>/phase-<n>/<name>.html` — the sibling layout `/cavalry:wireframe` and the
Cavalry `design/` convention both expect — and suffix the `<title>` with ` — Phase <n>` so the file
names itself wherever it's opened.

**The last phase usually equals the base.** When the plan leaves nothing to subtract, say so and
point at the base file instead of writing a duplicate.

## 4 · Prove each phase is a subtraction

Before showing a phase, run it:

```bash
SKILL=<this skill dir>
node "$SKILL/assets/check-subtraction.mjs" --base design/app.html --phase design/phase-1/app.html
```

| Check | Fails when |
|---|---|
| **css-untouched** | any `<style>` block differs from the base — something was restyled |
| **nothing-invented** | an element isn't in the base, or appears more often than it does. `data-phase-skeleton` elements are exempt |
| **nothing-moved** | the surviving elements aren't in the base's relative order — something was moved, reparented or hoisted |

It prints how much was removed and exits non-zero on any violation. **Fix the file and re-run until
it passes** — don't explain a failure away, and don't show the user a phase that hasn't passed. It
doesn't read copy or data, so still diff the file yourself for changed text.

`--json` gives the same result as an object.

## 5 · Review each phase

A phase file is a design the user should be able to argue with. Hand each one to
**`/cavalry:wireframe`** — it opens the page in the review workspace, takes comments straight on it,
and publishes the next version. Review phase N and settle it before generating phase N+1; a comment
on phase 1 usually changes the plan for every later phase.

Comments that amount to *"this belongs in a different phase"* are a §2 change, not an edit: update
the plan, then regenerate the affected phases from the base.

## Notes

- **Self-contained, like the base.** No external fonts, stylesheets or scripts — the phase files get
  opened, reviewed and bundled exactly as the base does.
- **Interactions count as elements.** A filter that only works because of a phase-3 index, a button
  that opens a phase-2 modal — these are subtracted too, even when the markup looks phase-1.
- **Don't delete the CSS for what you removed.** Unused rules are harmless, and editing the
  stylesheet is the fastest way to fail §4 and to drift the design.
- **`data-phase-skeleton` is a real marker, not a comment.** It stays in the file: it tells the
  checker what to allow, and tells a reviewer that the empty frame is deliberate.

## State & handoff

Runs standalone today — a base mockup and a set of phases are all it needs.

It is also **stage 5 of the planned Cavalry pipeline** (`docs/pipeline-wishlist.md` in the
`cavalry-skills` repo), which isn't built. When it is: read the base and phases from
`.cavalry/pipeline.json`, write `artifacts.wireframes[].phases`, and hand on to the build stages.
Until then there is no state file to read or write — don't create one.

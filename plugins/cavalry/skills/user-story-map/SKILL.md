---
name: user-story-map
description: Build an interactive, drag-and-drop user story map so the user can re-slice work across release phases. Use when the user wants a story map, a phased roadmap, release slicing, a backbone/activities journey map, or to decide "which stories go in which phase" and move them around.
---

Produce a **self-contained, interactive** user story map the user can operate: drag story cards between cells to re-slice which phase (and activity) each belongs to, reorder phases/activities/stories by dragging, edit inline, add/remove cards, phases, activities and tags, and export the result. It is published as an Artifact so drag-and-drop actually works in the browser.

## The three axes (get these right)

A story map has exactly three dimensions — clarify or infer all three before building:

1. **Activities (backbone)** — the columns, left→right, the user's journey / the sequence of high-level things they do (e.g. *Set up the role → Bring in candidates → Screen → …*). Order carries meaning; the user can re-drag it.
2. **Phases (swimlanes)** — the rows, top→bottom = release order (Phase 1 = first / MVP). Each has a name and a one-line goal. The user can re-drag the order.
3. **Stories** — the cards. Each belongs to exactly **one activity + one phase**; order within a cell is its rank (top = first). Each has a `status` — `open` (default) / `progress` / `review` / `done` — and the card's left border accent is coloured by status (cells are tinted by phase; a legend above the grid explains the colours — status never renders as a pill, pills are for tags). Omit `status` unless the context clearly says work has started. Keep the text short and recognizable to a user (what they can do), not implementation detail.

**Tags are cross-cutting themes**, not a card property to colour by. A story may carry any number of tags (e.g. `"AI"`, `"compliance"`); they render as small pills on the card, and the user can add/remove them per card or delete a tag everywhere via the ⌗ menu. Cards are always coloured by phase — never invent per-card colours. Seed tags only for genuine cross-cutting concerns you can identify (AI/automation is the common one).

Derive these from whatever context exists — a spec, a plan, a `tasks.md`, a development plan, the conversation. If the subject or its journey is unclear, ask briefly: what's the product, what are the ~5–9 journey steps, and how many release phases.

## Build steps

1. Read `assets/story-map-template.html` (next to this file). It is a finished engine + design — **do not edit the CSS or the `<script>` engine.**
2. Replace **only** two things: the `<title>` at the top (so the browser tab/gallery names it) and the JSON inside `<script id="data" type="application/json">…</script>`. Leave the CSS and engine untouched. Schema:
   ```json
   {
     "title": "…",
     "lang": "en",
     "tags": ["AI"],
     "activities": [{ "id": "a1", "name": "…", "task": "one-line goal" }],
     "phases":     [{ "id": "ph1", "name": "Phase 1", "goal": "one-line goal" }],
     "stories":    [{ "id": "s1", "activity": "a1", "phase": "ph1", "text": "…", "tags": ["AI"], "status": "open" }]
   }
   ```
   **The title is the product/initiative name only** (e.g. "Cavalry Hiring") — never append "Story Map", "— Story Map" or similar; the page's eyebrow already labels it a user story map. There is **no subtitle/description field** — the phase/activity goal lines carry the context. `lang` is optional and sets the initial UI language (`"en"` default or `"zh"`); the UI has an EN/中文 toggle either way, so set `"zh"` only when the user is clearly working in Chinese. The toggle switches UI chrome only — author titles, goals and story text in the user's language. Every `id` is a unique string; every story's `activity`/`phase` must match an existing id; every story tag should appear in the top-level `tags` list. Array order = display order. Colours are auto-assigned per phase (6 distinct hues, then cycle) — don't specify them.
3. Write the filled file (e.g. to the scratchpad) and **publish it with the Artifact tool** (favicon `🗺️`). The template already has a `<title>`; pass a one-line `description`. It is theme-aware and needs no other changes.
4. Tell the user how to use it: **drag any card into another cell** to re-slice its phase/activity, and drop above/below other cards to rank it; **drag a phase rail or activity header** onto another to reorder rows/columns (the whole column/row slides live while dragging — grab the ⠿ tab protruding from the top of a column or the left of a rail); double-click text to edit; hover a card for ▢ (multi-select) / ● (status dropdown) / ⌗ (tags) / ×; the **Select** button (top right) enters multi-select mode — click any card to select it (▢ and ⌘/Ctrl-click also work) — and a bulk bar appears for group status/tag/delete; the dashed **＋ story / ＋ activity / ＋ phase** buttons in the grid grow it; **Copy to Clipboard** (with a ▾ Download JSON option) exports the new arrangement (they can paste it back so you regenerate the downstream plan/tasks) and **Import** loads a saved one; the **EN | 中文** toggle at the top right switches the UI language.

## Notes

- **Self-contained** — no external fonts/scripts (Artifact CSP-safe). Drag-and-drop is native HTML5; edits persist per-map in the browser's `localStorage`.
- This is a *planning* tool, not a document — favour a clean, operable grid over prose. Keep story text to a short phrase; the goal lines on phases/activities carry the "why".
- If the user later pastes back an edited JSON, treat it as the new source of truth for re-slicing any plan/roadmap you generated from it. Old JSON with the legacy `"ai": true` flag still imports — the engine converts it to an `"AI"` tag.

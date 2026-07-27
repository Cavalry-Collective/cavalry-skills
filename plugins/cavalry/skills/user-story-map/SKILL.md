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
3. Write the filled file to a working directory — `.storymap/<slug>.html` under the project, or the scratchpad if the project shouldn't gain files.
4. **Serve it with the bridge** (default) so the user's edits come straight back to you — see *Live link* below. Publish as an Artifact **instead** only when the map is meant to be shared with other people, or when no local browser is in play: `Artifact` with favicon `🗺️` and a one-line `description` (the template already has a `<title>`). Both modes are theme-aware and need no other changes; the page adapts its own export bar to whichever it's in.
5. Tell the user how to use it: **drag any card into another cell** to re-slice its phase/activity, and drop above/below other cards to rank it; **drag a phase rail or activity header** onto another to reorder rows/columns (the whole column/row slides live while dragging — grab the ⠿ tab protruding from the top of a column or the left of a rail); double-click text to edit; hover a card for ● (status dropdown) / ⌗ (tags) / ×; the **Bulk select** button (top right) shows the bulk bar and lets them click any card to select it, for group status/tag/delete; the dashed **＋ story / ＋ activity / ＋ phase** buttons in the grid grow it; **Import** loads a saved map; the **EN | 中文** toggle at the top right switches the UI language. The primary export button is **Send to Claude** when bridged (Copy to Clipboard and Download JSON move under the ▾) and **Copy to Clipboard** when not.

## Live link (bridge)

`assets/bridge.py` (stdlib Python 3) serves the map on `127.0.0.1` and links it to this session in both directions. The page detects the bridge on its own — no edits to the HTML.

1. **Start it** with Bash `run_in_background`, from the directory holding the map:
   ```bash
   python3 <skill>/assets/bridge.py <slug>.html --port 0
   ```
   It prints `[bridge] ready http://127.0.0.1:<port>/?t=<token>` and the seq path. Give the user that URL — the token is required, so hand them the whole thing.
2. **Arm the wake-up** so their click reaches you with nothing typed — Bash `run_in_background`, which re-invokes you when it exits:
   ```bash
   S=<seq path>; U=<url path, same dir, .url>; n=<last seq you handled — 0 the first time>
   until [ "$(cat "$S" 2>/dev/null)" != "$n" ] || [ ! -f "$U" ]; do sleep 1; done
   [ -f "$U" ] && echo "sent, seq $(cat "$S")" || echo "link closed"
   ```
   On `sent`, read the JSON (same path as the HTML, `.json` extension) — that is the new source of truth — then **re-arm**, for as long as the map is open. On `link closed`, the user shut the tab: don't re-arm, and tell them the link is closed.

   **Pass `n` as the literal seq the waiter just printed — never re-read it with `$(cat "$S")` when re-arming.** A send that lands between your read and your re-arm would otherwise be swallowed: the fresh `cat` already includes it, so the loop waits for a *further* click that may never come, and the user sees nothing happen. Re-arming from the printed value can at worst make you read the same JSON twice, which costs nothing.
3. **Push back to the open page** by writing that JSON file yourself. The tab shows *"Claude updated this map — Refresh / Dismiss"*; it is never applied silently, so in-progress dragging is never clobbered. The bridge does not echo the page's own saves back at it.

### Closing the link

Closing the browser tab closes it. The page holds an SSE connection; when the last one goes away and none returns within the grace period (`--idle-timeout`, default 90s — long enough that a page reload reconnects), the server shuts down, removes the `.url` file, and exits. That exit re-invokes you, and the waiter above ends with `link closed`. Nothing is left listening.

Close it early with TaskStop on the server task. `--idle-timeout 0` keeps it up until then. Either way, **say the link is closed** when it is — the user should never have to guess whether a socket is still open, and after that their **Send to Claude** goes grey (*Link lost*) and only Copy to Clipboard works.

Failure modes to relay honestly: if the server is stopped or the port dies, the page's green **Linked to Claude** dot goes grey (*Link lost*) and Send falls back to showing the JSON to copy. Nothing is lost — the map also persists in `localStorage`.

## Notes

- **Self-contained** — no external fonts/scripts (Artifact CSP-safe). Drag-and-drop is native HTML5; edits persist per-map in the browser's `localStorage`.
- The bridge is **strictly optional to the page**: it works by injecting a `window.__USM_BRIDGE__` handle when it serves the file. Opened as an Artifact or straight off disk, the same file behaves exactly as it always did.
- This is a *planning* tool, not a document — favour a clean, operable grid over prose. Keep story text to a short phrase; the goal lines on phases/activities carry the "why".
- If the user later sends back (or pastes) an edited JSON, treat it as the new source of truth for re-slicing any plan/roadmap you generated from it. Old JSON with the legacy `"ai": true` flag still imports — the engine converts it to an `"AI"` tag.

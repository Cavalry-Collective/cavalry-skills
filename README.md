# Cavalry Collective — Claude Code Skills

A growing collection of [Claude Code](https://claude.com/claude-code) skills by [Cavalry Collective](https://github.com/Cavalry-Collective), published as the **`cavalry`** plugin. Install the plugin once and every skill in this repo becomes available under the `/cavalry:` namespace — new skills arrive with a plugin update, no re-install needed.

## Install

```
/plugin marketplace add Cavalry-Collective/cavalry-skills
/plugin install cavalry@cavalry-collective
```

Or copy an individual skill manually into your skills directory:

```bash
git clone https://github.com/Cavalry-Collective/cavalry-skills.git
cp -R cavalry-skills/plugins/cavalry/skills/<skill-name> ~/.claude/skills/
```

## Skills

| Skill | Invoke | What it does |
| --- | --- | --- |
| [user-story-map](#user-story-map) | `/cavalry:user-story-map` | Interactive drag-and-drop user story map — re-slice stories across release phases, rank everything, track status, tag themes, and send the result straight back to Claude |

More skills are on the way — ⭐ watch the repo to catch new ones.

---

## user-story-map

Ask Claude for a story map and it builds a **self-contained, interactive user story map** you can operate in the browser — no external dependencies. Claude serves it on `localhost` and keeps it **linked to the session**, so re-slicing the map feeds straight back into the conversation with no copy/paste. (It can also be published as a Claude Artifact when you want to share it.)

![Example: mobile shopping checkout flow story map](docs/story-map-example.png)

*Example: a mobile shopping app's checkout flow — the columns are the shopper's journey, the rows are release phases, and the cards are stories you can drag between them. Shown linked to a Claude session, hence the green dot and **Send to Claude**. Open [`examples/shopping-checkout.html`](examples/shopping-checkout.html) in a browser to try this exact map — standalone off disk it shows **Copy to Clipboard** instead, since there's no session to send to.*

### What you can do on the map

- **Drag a card into any cell** to re-slice which phase & activity a story belongs to; drop above/below other cards to rank it — cards, columns and rows slide live while you drag
- **Drag a column or row by its ⠿ handle** — a Notion-style pill that appears on hover at the top of each column / left of each row — to reorder the journey and the release phases
- **Track status per story** — open / in progress / in review / done; the card's accent stripe is coloured by status (a legend above the grid explains the colours), and the ● button on each card opens a status dropdown
- **Bulk select** (top right) — click it, then click any part of any card to select; set status, tag, or delete the whole selection from the floating bar
- **Tag cross-cutting themes** (e.g. `AI`) via the ⌗ menu on each card — add a tag to a card, create new tags, or delete a tag from the whole map
- **Double-click any text** to edit inline; dashed `＋ story` / `＋ activity` / `＋ phase` buttons in the grid grow the map
- **EN | 中文 toggle** (top right) for the UI language
- **Send to Claude** — one click puts the re-sliced map straight back into the Claude session; Claude wakes up on its own and regenerates your downstream plan or tickets. Nothing to copy, nothing to type. Claude can push the other way too, and the map offers you a **Refresh** rather than overwriting what you're in the middle of
- **Copy to Clipboard / Download JSON** (under the ▾) and **Import** — for when the map isn't linked to a session, e.g. opened as an Artifact or straight off disk; edits persist in the browser's `localStorage` either way

### Use

Once installed, invoke it as a slash command:

```
/cavalry:user-story-map build a map for our mobile shopping app's checkout flow, three release phases
```

Or just ask in natural language — the skill triggers whenever you ask for a story map, phased roadmap, or release slicing:

> Build a user story map for our mobile shopping app's checkout flow, three release phases.

Claude infers the three axes from your spec / plan / conversation — **activities** (the user journey, left→right), **phases** (release order, top→bottom), and **stories** (the cards) — fills the template, and hands you a `http://127.0.0.1:…` link.

### The live link

While the map is open it stays connected to the session that made it — a green **● Linked to Claude** dot in the toolbar tells you so.

- **Re-slice, then hit Send to Claude.** Claude wakes up by itself and reads the new arrangement. You can send as many times as you like; the link isn't one-shot.
- **Claude can push back** — if it proposes a change, a bar appears offering **Refresh**. It's never applied behind your back, so a push can't yank the grid out from under you mid-drag.
- **Close the window when you're done.** The link closes itself about 90 seconds later (the delay is a grace period so a page reload doesn't kill it) and Claude tells you it's shut. Nothing is left listening.

If the link ever drops, the dot goes grey and **Send** falls back to handing you the JSON — your map is safe in `localStorage` regardless.

### Data format

The map is driven by one JSON block:

```json
{
  "title": "ShopLite",
  "lang": "en",
  "tags": ["AI"],
  "activities": [{ "id": "a1", "name": "Browse & search", "task": "Find products worth buying" }],
  "phases":     [{ "id": "ph1", "name": "Phase 1", "goal": "Guest checkout MVP" }],
  "stories":    [{ "id": "s1", "activity": "a1", "phase": "ph1", "text": "Search by keyword", "tags": [], "status": "open" }]
}
```

Array order is display order; story order within a cell is its rank. Cell tints are auto-assigned per phase; the card accent is coloured by `status` (`open` / `progress` / `review` / `done`). `lang` (`"en"`/`"zh"`) sets the initial UI language.

This same block is what **Send to Claude** hands back, what **Download JSON** writes, and what **Import** accepts — so a map is portable between a live session, a file, and an Artifact.

---

## Repo layout / adding a skill

```
.claude-plugin/marketplace.json      ← marketplace manifest
plugins/cavalry/                     ← the `cavalry` plugin
  .claude-plugin/plugin.json
  skills/
    user-story-map/                  ← one directory per skill
      SKILL.md
      assets/…
```

Every directory added under `plugins/cavalry/skills/` ships with the plugin and is invocable as `/cavalry:<skill-name>` — no manifest changes needed.

## License

[MIT](LICENSE)

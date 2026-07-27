# Cavalry Collective — Claude Code Skills

A growing collection of [Claude Code](https://claude.com/claude-code) skills by [Cavalry Collective](https://github.com/Cavalry-Collective), published as the **`cavalry`** plugin. Install the plugin once and every skill in this repo becomes available under the `/cavalry:` namespace — new skills arrive with a plugin update, no re-install needed.

## Install

```
/plugin marketplace add Cavalry-Collective/claude-skills
/plugin install cavalry@cavalry-collective
```

Or copy an individual skill manually into your skills directory:

```bash
git clone https://github.com/Cavalry-Collective/claude-skills.git
cp -R claude-skills/plugins/cavalry/skills/<skill-name> ~/.claude/skills/
```

## Skills

| Skill | Invoke | What it does |
| --- | --- | --- |
| [user-story-map](#user-story-map) | `/cavalry:user-story-map` | Interactive drag-and-drop user story map — re-slice stories across release phases, rank everything, track status, tag themes |

More skills are on the way — ⭐ watch the repo to catch new ones.

---

## user-story-map

Ask Claude for a story map and it builds a **self-contained, interactive user story map** you can operate in the browser — no external dependencies, published as a Claude Artifact (or saved as a plain HTML file).

![Example: mobile shopping checkout flow story map](docs/story-map-example.png)

*Example: a mobile shopping app's checkout flow — the columns are the shopper's journey, the rows are release phases, and the cards are stories you can drag between them. Open [`examples/shopping-checkout.html`](examples/shopping-checkout.html) in a browser to try this exact map.*

### What you can do on the map

- **Drag a card into any cell** to re-slice which phase & activity a story belongs to; drop above/below other cards to rank it — cards, columns and rows slide live while you drag
- **Drag a column or row by its ⠿ handle** — a Notion-style pill that appears on hover at the top of each column / left of each row — to reorder the journey and the release phases
- **Track status per story** — open / in progress / in review / done; the card's accent stripe is coloured by status (a legend above the grid explains the colours), and the ● button on each card opens a status dropdown
- **Multi-select for bulk edits** — ▢ on cards or ⌘/Ctrl-click to select several, then set status, tag, or delete them all from the floating bar
- **Tag cross-cutting themes** (e.g. `AI`) via the ⌗ menu on each card — add a tag to a card, create new tags, or delete a tag from the whole map
- **Double-click any text** to edit inline; dashed `＋ story` / `＋ activity` / `＋ phase` buttons in the grid grow the map
- **EN | 中文 toggle** (top right) for the UI language
- **Copy to Clipboard** (▾ for Download JSON) / **Import** — export the re-sliced map as JSON and paste it back to Claude to regenerate your downstream plan or tickets; edits persist in the browser's `localStorage`

### Use

Once installed, invoke it as a slash command:

```
/cavalry:user-story-map build a map for our mobile shopping app's checkout flow, three release phases
```

Or just ask in natural language — the skill triggers whenever you ask for a story map, phased roadmap, or release slicing:

> Build a user story map for our mobile shopping app's checkout flow, three release phases.

Claude infers the three axes from your spec / plan / conversation — **activities** (the user journey, left→right), **phases** (release order, top→bottom), and **stories** (the cards) — fills the template, and publishes it. When you're done re-slicing, hit **Copy to Clipboard** and paste the result back so Claude can regenerate the plan from your arrangement.

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

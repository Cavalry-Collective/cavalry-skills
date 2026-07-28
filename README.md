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
| [ui-review](#ui-review) | `/cavalry:ui-review` | Comment directly on any HTML UI in a review workspace, and send structured feedback straight back to Claude — a two-way loop, like reviewing with a designer |
| [phase-wireframe](#phase-wireframe) | `/cavalry:phase-wireframe` | Cut one signed-off mockup into a mockup per release phase — each showing only what exists by that phase, with the layout untouched. Subtraction only, checked mechanically |
| [init](#init) | `/cavalry:init` | Start a project from the Cavalry template — pick the stack and add-ons on a visual chooser, delete the rest, and work through Day-1 until the repo is ready to build in |

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

## ui-review

Design review without the screenshot-and-markup detour. Claude opens **any HTML UI** — a mockup it just built, an exported screen, a prototype — in a **review workspace** where you comment straight on the page, then applies your comments and publishes the next version while you watch.

![Example: commenting on a hiring queue](docs/ui-review-example.png)

*Example: a triage queue mid-review — an area comment over the toolbar, a pin on an overdue row, and a note being written on the canvas. Open [`examples/ui-review.html`](examples/ui-review.html) in a browser to try it.*

### The loop

```
requirements ──► page.html ──► review workspace ──► feedback.md ──┐
      ▲                        (you comment)                      │
      └─────── Claude applies it, replies, publishes v(N+1) ◄─────┘
```

It's a conversation, not a hand-off. You comment; Claude applies what's clear, **asks about what isn't**, and marks each comment done only when it has actually changed it. Anything Claude skips comes back next round — there is no resolve button for you to paper over it with.

### In the workspace

- **Two modes, one key.** **View** clicks through the live page with every annotation hidden, so you judge it as it really is; **Annotate** brings them back. **Space** toggles.
- **Click for a comment, drag for an area.** That's the whole vocabulary. The note opens on the canvas, right where the mark is — and a comment you leave empty is discarded, so nothing half-said reaches Claude.
- **Quiet by default.** Marks show their note when you open one or hover it in Annotate, not all at once.
- **Threads.** Claude's questions appear on the comment itself; you answer there, and the answer goes back with the next round.
- **Four screen sizes** — ultrawide, desktop, tablet, phone. A comment belongs to the size it was made at, so phone feedback never lands on the desktop layout.
- **Version timeline** along the bottom — drag the handle to scrub through published versions.
- **Nothing about markup, anywhere.** Comments are located by where they are and the words they sit on. You never see a CSS selector.
- **EN / 中文** for the workspace chrome; your comments keep the words you wrote them in.
- **Send is one click** — no preview step — and greys out until something has actually changed. Delete a comment, or clear the lot, whenever you like.

### Use

```
/cavalry:ui-review a settings page for our billing product — plans, invoices, payment methods
```

Or point it at a page that already exists:

> Review this screen with me — open `dist/checkout.html`.

For a new design, point it at a reference site (`match stripe.com`), hand it screenshots, or let it read a `design/` folder with `tokens.css` — it resolves one design source and holds it across every iteration.

### Sharing a review

For a stakeholder who isn't at your machine, Claude flattens the same workspace — page, versions and all — into a single self-contained HTML file and publishes it as a Claude Artifact. Commenting works identically; **Send** becomes **Copy for Claude**.

---

## phase-wireframe

You have a mockup everyone signed off. Now you need to know what it looks like at the end of Phase 1
— because that's what you're actually building first. This cuts the approved design down, one file
per phase, and **only ever subtracts**: nothing moves, nothing is resized or restyled, nothing new
is invented. The Phase 1 file is the real build target for Phase 1, not a redrawing of it.

```
base.html ──┬──► phase-1/base.html    only what ships in phase 1
            ├──► phase-2/base.html    phase 1 + phase 2
            └──► phase-3/base.html    phase 1 + 2 + 3   ( = the base, if phases cover it all )
```

Phases are **cumulative** — Phase 2 shows Phase 1 as well — and every phase is cut from the original,
never from the previous phase's output, so errors don't compound.

### How it works

- **The plan comes first.** Claude inventories every element in the mockup and assigns each the
  earliest phase it exists in, then shows you that table before touching any HTML. This is where you
  argue about what's in Phase 1 — and where elements that no story covers get flagged instead of
  silently kept or cut.
- **Phase order, one at a time.** Phase 1 is generated, checked and reviewed before Phase 2 starts,
  because a comment on Phase 1 usually changes every later phase.
- **Gated features get a skeleton.** If a Phase 1 feature only opens through a Phase 3 modal, the
  feature stays exactly where it is and the modal is replaced with the minimum empty frame — so the
  Phase 1 feature stays visible and reachable. Every skeleton is marked in the file, so a reviewer
  can see the blank space is deliberate.
- **The subtraction is proved, not promised.** Each phase file is checked against the base before you
  see it: the stylesheet must be byte-identical, no element may exist that isn't in the base, and the
  surviving elements must appear in the base's exact order. Moved, restyled or invented anything, and
  it fails and gets fixed before it reaches you.

```bash
node assets/check-subtraction.mjs --base design/app.html --phase design/phase-1/app.html
#  18 kept · 14 removed (44%) · 0 skeletons
#  ✓ pure subtraction — CSS untouched, nothing invented, nothing moved
```

- **Then review it.** Each phase hands off to [ui-review](#ui-review), so you comment on a phase
  mockup the same way you commented on the original.

### Use

```
/cavalry:phase-wireframe cut design/candidate-pipeline.html into phases using specs/story-map.json
```

Or in natural language — it triggers on a Phase 1 or MVP version of an existing mockup, phased or
staged mockups, or slicing a screen by release phase:

> Show me what this screen looks like in Phase 1.

It takes the phases from a [user-story-map](#user-story-map) JSON if you have one (best input — the
map already says which story lands when), otherwise from a spec's P1/P2/P3 priorities, otherwise from
whatever you tell it. It won't invent a release plan.

---

## init

A new project starts as [`cavalry-template-spa`](https://github.com/Cavalry-Collective/cavalry-template-spa)
— architecture contracts, design tokens, stack packs and add-ons, all still optional. This turns it into
*your* project: clone, choose, delete the rest, fill in the Day-1 checklist.

### The chooser

Rather than a wall of questions, the two decisions happen on one page: **pick one stack pack, tick any
add-ons**, with a running panel showing what the project will contain and — just as important — **what is
about to be deleted**.

That list matters, because in this template **adoption is deletion**. Exactly one directory survives under
`stacks/` and only the wanted ones under `add-ons/`; that's how each area's `CLAUDE.md` knows which contract
applies. Setup really does end by removing most of what it just cloned, so you see the delete list before you
confirm it.

The page reads `stacks/` and `add-ons/` **from your clone**, so it always offers what the template actually
ships — a pack added upstream shows up on its own, and one it has no blurb for still renders from its README.

It asks once. Send, and it writes your answer and shuts down; nothing is left listening.

### Then Day-1, in order

Delete the unchosen directories · record the stack in `CLAUDE.md` · fill the toolchain from the pack's own
command blocks · declare the primary form factor · **rebrand and confirm the design guide** — the gate before
any screen gets built · copy runtime config.

The last three steps — protect `main`, stand up staging, confirm CI green — are GitHub settings and a live
push, so they come back as a checklist rather than happening to your repo unasked.

### Use

```
/cavalry:init a hiring pipeline for mid-size agencies
```

Or just say you want to start a new project. If you'd rather answer in chat than on the page, say so — the
chooser is the nicer path, not the only one.

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
    ui-review/
      SKILL.md
      assets/…                       ← workspace, local server, artifact bundler
      references/…                   ← loaded on demand, not up-front
    phase-wireframe/
      SKILL.md
      assets/…                       ← the subtraction checker
    init/
      SKILL.md
      assets/…                       ← the chooser page + its one-shot server
docs/
  pipeline-wishlist.md               ← where the chain is going, and what's still open
  mockups/                           ← screens for the stages not yet built
```

Every directory added under `plugins/cavalry/skills/` ships with the plugin and is invocable as `/cavalry:<skill-name>` — no manifest changes needed.

## License

[MIT](LICENSE)

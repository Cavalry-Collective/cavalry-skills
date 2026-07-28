# Cavalry Collective — Claude Code Skills

[Claude Code](https://claude.com/claude-code) skills by [Cavalry Collective](https://github.com/Cavalry-Collective), published as the **`cavalry`** plugin. Install once and every skill — current and future — is available under `/cavalry:`.

## Install

```
/plugin marketplace add Cavalry-Collective/cavalry-skills
/plugin install cavalry@cavalry-collective
```

## Skills

| Skill | What you get |
| --- | --- |
| `/cavalry:init` | Set up a new project from [`cavalry-template-spa`](https://github.com/Cavalry-Collective/cavalry-template-spa) — pick your stack and add-ons on one page. |
| `/cavalry:wireframe` | Review a UI by commenting directly on the page. Claude applies your feedback and publishes the next version while you watch. |
| `/cavalry:user-story-map` | Plan releases on an interactive story map. Drag stories between phases and send the new slicing straight back to Claude. |
| `/cavalry:phase-wireframe` | See what an approved design looks like at each release phase — a faithful cut-down of the original, per phase. |

More on the way — ⭐ watch the repo.

The idea behind all of them: **you work on the artifact, not in the chat**. Feedback happens where the work is — a comment pinned to a button, a card dragged to Phase 2 — and flows back to Claude with no copy/paste.

### wireframe

![Commenting on a hiring queue in the review workspace](docs/wireframe-example.png)

Try it: open [`examples/wireframe.html`](examples/wireframe.html) in a browser.

### user-story-map

![A checkout-flow story map linked to a Claude session](docs/story-map-example.png)

Try it: open [`examples/shopping-checkout.html`](examples/shopping-checkout.html) in a browser.

## Adding a skill

Any directory added under `plugins/cavalry/skills/<name>/` with a `SKILL.md` ships with the plugin and is invocable as `/cavalry:<name>` — no manifest changes needed.

To use a single skill without the plugin, copy it into your skills directory:

```bash
git clone https://github.com/Cavalry-Collective/cavalry-skills.git
cp -R cavalry-skills/plugins/cavalry/skills/<skill-name> ~/.claude/skills/
```

## License

[MIT](LICENSE)

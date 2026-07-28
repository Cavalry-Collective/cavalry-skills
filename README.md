# Cavalry Visual Stack

**Visual-first delivery — plan, design, and build software with Claude Code.**
By [Cavalry Collective](https://cavalry.sg).

Cavalry Visual Stack is a set of [Claude Code](https://claude.com/claude-code) skills for visual-first delivery: the work itself in front of you — a story map you rearrange, a design you comment on — with every change feeding straight back to Claude. No screenshots, no copy/paste, no describing a layout in prose.

---

## Install

```
/plugin marketplace add Cavalry-Collective/visual-stack
/plugin install vstack@cavalry-collective
```

One install, every skill — including the ones we haven't shipped yet.

---

## The workflow

Start the project, design the screens, map the releases, see each phase — one visual thread from plan to execution.

| Skill | Why you'll want it |
| --- | --- |
| `/vstack:init` | New project, one page of choices, done. Powered by [`cavalry-template-spa`](https://github.com/Cavalry-Collective/cavalry-template-spa). |
| `/vstack:wireframe` | Comment right on the design. Watch the next version appear. |
| `/vstack:user-story-map` | Drag stories between releases until the plan feels right. Claude replans around it. |
| `/vstack:phase-wireframe` | Everyone approved the mockup — now see what Phase 1 actually looks like. |

More on the way — ⭐ watch the repo.

### Design review, directly on the page

![Commenting on a hiring queue in the review workspace](docs/wireframe-example.png)

See it for yourself: open [`examples/wireframe.html`](examples/wireframe.html) in a browser.

### Release planning on a live story map

![A checkout-flow story map linked to a Claude session](docs/story-map-example.png)

See it for yourself: open [`examples/shopping-checkout.html`](examples/shopping-checkout.html) in a browser.

### See each release phase before you build it

![Scrubbing a candidate pipeline from Phase 1 to Phase 3, with what's new highlighted](docs/phase-wireframe-example.png)

Scrub the timeline to watch a release take shape — **Highlight new** marks what each phase adds.

---

## The thinking behind it

Spec-driven development got one thing right: agree on what you're building before you build it. Then it buried the agreement in text. A spec here, a plan there, a task list under that — until the team is snowed under by documents that get skimmed, approved to be polite, and contradicted by the code three days later. The review that mattered never happened.

**Visual-first delivery turns that on its head. Humans are visual. Products are visual. The plan should be too.**

So every stage produces something you operate instead of something you read: change what's wrong, and the change *is* the feedback. It's the oldest value in the [Agile Manifesto](https://agilemanifesto.org/) — *working software over comprehensive documentation* — finally applied to the planning artifacts themselves. Prose is the export, never the interface.

---

## Adding a skill

Drop a directory with a `SKILL.md` under `plugins/vstack/skills/<name>/` and it ships as `/vstack:<name>`. That's it.

Want just one skill, no plugin? Copy it straight in:

```bash
git clone https://github.com/Cavalry-Collective/visual-stack.git
cp -R visual-stack/plugins/vstack/skills/<skill-name> ~/.claude/skills/
```

---

## License

[MIT](LICENSE)

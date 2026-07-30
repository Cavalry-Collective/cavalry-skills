<img src="docs/brand/vstack-lockup-tile-1120.png" alt="Visual Stack" width="420">

# Visual Stack

**A modern interface for building software with Claude Code.**

Visual-first planning, design review and release delivery by [Cavalry Collective](https://cavalry.sg).

Claude Code is extraordinarily capable. Its interface is still a terminal and a wall of scrolling
text.

Visual Stack adds interactive pages you can see, edit and operate: comment directly on a design,
rearrange a story map or scrub through the phases of a release. Every change flows back to Claude and
becomes part of what gets built.

No screenshots. No copy-paste. No describing "the button near the top-right" in prose.

---

## Install

Run these two commands in Claude Code:

```text
/plugin marketplace add Cavalry-Collective/visual-stack
/plugin install vstack@cavalry-collective
```

One plugin gives you the complete Visual Stack workflow.

---

## The workflow

Move from first decisions to a running build through one continuous visual thread.

| Skill | What it gives you |
| --- | --- |
| `/vstack:go` | Read the conversation, the repository and the current pipeline, then move to the right stage. |
| `/vstack:start` | Start a project from one page of decisions. Powered by [`vstack-template-base`](https://github.com/Cavalry-Collective/vstack-template-base). |
| `/vstack:wireframe` | Review the actual design, comment directly on what should change and receive the next version. |
| `/vstack:spec` | Explore epics, stories and acceptance criteria as a drill-down tree, and prune what you don't need. |
| `/vstack:user-story-map` | Arrange the journey, move stories between releases and let Claude replan around your decisions. |
| `/vstack:phase-wireframe` | Turn an approved design into a visual definition of what each release phase delivers. |
| `/vstack:phase-build` | Approve the build plan and follow each endpoint and component as it lands. |

More of the delivery workflow is on the way. ⭐ Watch the repository to follow new releases.

### Review the design itself

![A comment opened directly on the page under review](docs/screens/wireframe.png)

Comments stay attached to the page under review, so Claude knows exactly what you mean.

Try it: open [`examples/wireframe.html`](examples/wireframe.html) in a browser.

### Shape the specification

![The spec as a drill-down tree of epics, stories and acceptance criteria](docs/screens/spec.png)

Open at the headlines, drill into what matters and prune the rest.

### Plan releases on a live story map

![The story map: activities across the journey, stories arranged by release](docs/screens/story-map.png)

Move a story between releases and Claude replans around the change.

Try it: open [`examples/shopping-checkout.html`](examples/shopping-checkout.html) in a browser.

### See each release before you build it

![A signed-off screen at Phase 2, with everything the phase adds outlined](docs/screens/phase-wireframe.png)

Scrub through the timeline to watch the product take shape. **Highlight new** shows exactly what each
phase adds.

### Watch the system take shape

![The build board: endpoints and components, marked new, changed or already built](docs/screens/phase-build.png)

Approve the plan, then follow each endpoint and component as it lands.

---

## Why we built Visual Stack

We have tried spec-driven development and see the value in it: clear context helps Claude make better
decisions. But in practice, a brief becomes a spec, the spec becomes a plan, and the plan grows into
tasks, reports and notes. Before long, more time is spent reading about the work than looking at the
work itself.

We wanted a better balance.

Visual Stack keeps the context Claude needs, but puts the plan into forms people can use directly:
screens to comment on, story maps to rearrange and release phases to inspect. Each change flows back
to Claude without another round of prose.

The approach will feel familiar to teams used to Lean and Agile: visible work, small releases and
short feedback loops. Visual Stack is our attempt to keep what works about SDD while making it easier
to see, review and change.

---

## Keep the tools that already work

Visual Stack adds a visual operating layer to your existing workflow. It takes plain files in and puts
plain files out, installs no hooks and claims no ownership of `specs/` — use it with plain Claude
Code, beside Spec Kit, under Superpowers.

---

## Adding a skill

Add a directory containing `SKILL.md` under:

```text
plugins/vstack/skills/<name>/
```

It will be available as:

```text
/vstack:<name>
```

Want one skill without installing the plugin? Copy it into your Claude Code skills directory:

```bash
git clone https://github.com/Cavalry-Collective/visual-stack.git
cp -R visual-stack/plugins/vstack/skills/<skill-name> ~/.claude/skills/
```

`spec` and `phase-build` also need the shared engine — copy `plugins/vstack/lib/` to `~/.claude/lib/`
as well, or install the plugin instead.

---

## Support

- A bug or an unclear skill: open an issue.
- A change you want to make: read [`CONTRIBUTING.md`](CONTRIBUTING.md).
- A security concern: email **adam@cavalry.sg** rather than opening a public issue — see [`SECURITY.md`](SECURITY.md). This repository publishes a plugin that runs on installers' machines, so please report privately.
- Anything else, including conduct reports: email **adam@cavalry.sg**. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)

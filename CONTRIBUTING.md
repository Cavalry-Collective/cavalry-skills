# Contributing

Visual Stack is a Claude Code and Codex plugin: skills, prompts, and the HTML workspaces they open. A change here changes what runs on an installer's machine, so scope and permissions matter more than line count.

## Before you open a PR

- Work on a short-lived branch off `main` and open a PR. `main` requires one.
- Keep a skill's footprint inside the user's project. Nothing writes outside it, and nothing transmits anywhere, unless that is the skill's stated purpose.
- Per-machine state belongs under `.vstack/local/<tool>/`, which is gitignored whole — never in the repo, and never elsewhere in `.vstack/`, which is the pipeline. Resolve the path with `lib/workdir.mjs` rather than joining it by hand.
- Workspaces are self-contained HTML. No external requests at runtime — inline what a page needs.
- If you add or rename a plugin, update `.claude-plugin/marketplace.json` in the same commit.

## Testing a change

Install the plugin from your branch and drive the skill end to end in a real project. A skill that has only been read is untested. For Codex changes, validate the plugin manifest and wireframe skill, then run `node plugins/vstack/skills/wireframe/tests/host-profiles.mjs`.

## Reporting problems

- A bug or an unclear skill: open an issue.
- Anything you would rather not post publicly: email **adam@cavalry.sg**.
- A security concern: follow [`SECURITY.md`](SECURITY.md) instead.

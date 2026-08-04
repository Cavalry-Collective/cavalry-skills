# Contributing

Visual Stack is a Claude Code and Codex plugin: skills, prompts, and the HTML workspaces they open. A change here changes what runs on an installer's machine, so scope and permissions matter more than line count.

## Before you open a PR

- Work on a short-lived branch off `main` and open a PR. `main` requires one.
- Keep a skill's footprint inside the user's project. Nothing writes outside it, and nothing transmits anywhere, unless that is the skill's stated purpose.
- Per-machine state belongs under `.vstack/local/<tool>/`, which is gitignored whole — never in the repo, and never elsewhere in `.vstack/`, which is the pipeline. Resolve the path with `lib/workdir.mjs` rather than joining it by hand.
- Workspaces are self-contained HTML. No external requests at runtime — inline what a page needs.
- If you add or rename a plugin, update `.claude-plugin/marketplace.json` in the same commit.

## Testing a change

Install the plugin from your branch and drive the skill end to end in a real project. A skill that has only been read is untested. For Codex changes, validate the plugin manifest and review skill, then run `node plugins/vstack/skills/review/tests/host-profiles.mjs`.

CI runs on every PR and repeats what you can run locally:

```bash
node plugins/vstack/skills/review/tests/review-lifecycle.mjs
node plugins/vstack/skills/review/tests/host-profiles.mjs
node plugins/vstack/skills/review/tests/workdir.mjs
node plugins/vstack/lib/build-shell.mjs check
claude plugin validate . --strict
claude plugin validate ./plugins/vstack --strict
```

Nothing runs end to end in CI, so a green build is not a tested skill.

CI also cannot install the plugin. Rehearse that locally before a release, with `CLAUDE_CONFIG_DIR` pointed at a throwaway directory so the local-path marketplace is not written to your real settings, where it would shadow the published `cavalry-collective`:

```bash
SANDBOX=$(mktemp -d)
CLAUDE_CONFIG_DIR=$SANDBOX/.claude claude plugin marketplace add ./
CLAUDE_CONFIG_DIR=$SANDBOX/.claude claude plugin install vstack@cavalry-collective
CLAUDE_CONFIG_DIR=$SANDBOX/.claude claude plugin details vstack
rm -rf $SANDBOX
```

`details` prints the name, version, description and skill inventory a user sees. The source must be `./` and not `.`.

## Cutting a release

Both host manifests declare a `version`, and that version is what Claude Code and Codex compare against to decide an update exists. **Pushing commits without bumping it ships nothing to anyone.**

1. Branch `release/vX.Y.Z` off `main`.
2. Bump `version` to the same value in `plugins/vstack/.claude-plugin/plugin.json` and `plugins/vstack/.codex-plugin/plugin.json`.
3. Add the release to `CHANGELOG.md`, newest first.
4. Open a PR. `main` takes no direct pushes, and a release is not an exception.
5. Merge when CI is green, then tag `vX.Y.Z` on the squashed commit on `main`. The release workflow fails when the tag and the manifest disagree.
6. Publish the GitHub release with the changelog entry as its notes.

Version to semantic versioning: MAJOR for a breaking change to a skill name, an on-disk path, or a protocol; MINOR for new behaviour; PATCH for a fix.

Orphaning a user's in-flight state is a MAJOR change, and it needs a `LEGACY` entry in `lib/workdir.mjs` rather than a migration.

## Reporting problems

- A bug or an unclear skill: open an issue.
- Anything you would rather not post publicly: email **adam@cavalry.sg**.
- A security concern: follow [`SECURITY.md`](SECURITY.md) instead.

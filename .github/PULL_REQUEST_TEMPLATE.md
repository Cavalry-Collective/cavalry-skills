## What this changes

<!-- What the change does, and why. A reviewer should not have to read the diff to find out. -->

## How it was tested

<!--
Installing the plugin from this branch and driving the skill end to end in a
real project. A skill that has only been read is untested. Say which host you
drove it on.
-->

## Checklist

- [ ] Installed the plugin from this branch and drove the affected skill end to end.
- [ ] Nothing writes outside the user's project, and nothing transmits anywhere, unless that is the skill's stated purpose.
- [ ] Per-machine state resolves through `lib/workdir.mjs` and lands under `.vstack/local/<tool>/`.
- [ ] Pages stay self-contained. No external requests at runtime.
- [ ] Edited `lib/shell/` rather than a stamped region, ran `node plugins/vstack/lib/build-shell.mjs stamp`, and committed both.
- [ ] Added or renamed a plugin, and updated `.claude-plugin/marketplace.json` in the same commit.
- [ ] Renamed a tool, and added its former directory name to the `LEGACY` map in `lib/workdir.mjs`.
- [ ] Every security scan passes, and no finding was silenced instead of fixed.
- [ ] Added a step that uses an action, and pinned it by commit SHA with the version in a trailing comment.

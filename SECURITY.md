# Security policy

## Reporting a vulnerability

Email **adam@cavalry.sg**. Do not open a public issue for a security report.

Include the affected skill or script, what an attacker gains, and a reproduction if you have one. Expect an acknowledgement within five working days.

## Why this matters here

This repository publishes the `vstack` plugin through `.claude-plugin/marketplace.json`. Anything on `main` runs on the machine of everyone who installs it, with their Claude Code permissions. Treat it as a distribution point, not a document store.

In scope:

- a skill or script that reads, writes, or transmits outside the user's project without that being the stated purpose;
- prompt or file content that could redirect an agent into an action the user did not ask for;
- a shell command that mishandles untrusted input such as a filename, URL, or page content;
- anything that widens what the plugin can reach on the host.

Out of scope: vulnerabilities in Claude Code itself — report those to Anthropic.

## What runs on every change

`.github/workflows/security.yml` runs these scans on every pull request, on every push to `main`, and weekly. The `Security gates` job fails unless all four report success, so a scan that is skipped or cancelled blocks the merge in the same way a failing one does.

| Scan | Tool | What it enforces |
|---|---|---|
| Static analysis | CodeQL, `security-and-quality` suite | Injection, path traversal, and unsafe DOM construction in the servers and the pages. Findings land in the repository's Security tab. |
| Secret scan | Gitleaks | No credential in any commit. It reads the full history, not the working tree, because anything ever committed is compromised. |
| Workflow audit | zizmor | The workflows themselves: token permissions, credential persistence, and untrusted input reaching a `run` block. |
| Code quality | SonarQube Cloud | Bugs, security hotspots, and maintainability on new code. Free for public projects. The scan reports a skip rather than failing where `SONAR_TOKEN` is unavailable, which is every pull request from a fork. |

`.github/workflows/scorecard.yml` runs OpenSSF Scorecard weekly and on `main`. It rates the repository rather than the code — branch protection, pinned actions, token permissions — and publishes the score the README badge reads.

Two rules keep those gates meaningful:

- Fix a finding rather than silencing it. A suppression carries a comment saying why it cannot be fixed, next to the line it applies to.
- Actions are pinned by commit SHA with the version in a trailing comment. A tag moves, and a moved tag runs code nobody reviewed. Dependabot proposes the bumps weekly.

## Supported versions

`main` only. There are no maintained release branches.

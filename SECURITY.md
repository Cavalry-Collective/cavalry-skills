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

## Supported versions

`main` only. There are no maintained release branches.

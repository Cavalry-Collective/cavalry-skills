# Contracts

Tool-agnostic interfaces for Visual Stack. Hosts (Claude Code, Codex, Grok Build, …)
implement these; the engine and skills depend only on the contracts, never on a
particular agent product.

| Contract | What it defines |
| --- | --- |
| [`host.md`](host.md) | What a coding-agent host must provide (ops + profile) |
| [`review-loop.md`](review-loop.md) | Wireframe review protocol: CLI, sentinels, events, on-disk roles |
| [`host.schema.json`](host.schema.json) | JSON Schema for a Host profile (runtime injection) |

## Layout

```
plugins/vstack/
  contracts/           ← this directory (the specs)
  hosts/               ← profiles that implement Host (claude.json, codex.json, grok.json)
  lib/host.mjs         ← loads a profile; used by servers
  skills/wireframe/
    SKILL.md           ← loop in contract terms (no host-specific tools)
    hosts/claude.md    ← Claude Code adapter: maps Host ops → tools
    hosts/codex.md     ← Codex adapter: same
    hosts/grok.md      ← Grok Build adapter: same
```

## Rules

1. **Engine speaks contracts.** `review-server.mjs`, the workspace, and shared
   shell never name a product except as data from a Host profile.
2. **Adapters speak hosts.** Only `hosts/*.md` (and the Host profile JSON) may
   mention Monitor, Artifact, `monitor`, etc.
3. **Profiles are data.** UI labels, install steps, and capability flags come
   from `hosts/<id>.json`, injected as `window.__VSTACK_HOST__` and selected by
   `VSTACK_HOST` / `--host`.
4. **On-disk roles are stable.** Review threads use `by: "agent" | "reviewer"`.
   Older files may still say `"claude"`; readers treat that as `"agent"`.

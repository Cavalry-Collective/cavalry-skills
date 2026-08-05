# Wishlist — the review tool

Features that have been considered for the review tool and are not being built yet. Each entry says
what it has to do to ship. An entry stays here until its acceptance criteria can be met.

## Stop a round in flight

**Status: withdrawn on 5 August 2026**, after an implementation that could not meet criterion 1.

**What it should do.** The reviewer presses Stop and the agent stops working on that round.

**Acceptance criteria.**

1. Stop interrupts the agent's current turn, the way Esc does in the reviewer's own session.
   A request the agent has to notice for itself does not qualify.
2. The interruption holds without the agent calling a protocol command. An agent that never calls
   `check` still stops.
3. The workspace shows the round as ended once it has ended.

**What it needs.** A Host op that interrupts the running turn, exposed by every host the plugin
supports — or a host-specific adapter path, with a fallback that says plainly what happens on a host
without the op. `contracts/host.md` has no such op today.

**Until then.** The reviewer sends again. The brief is the state of the review rather than a diff,
so the next send supersedes the last one.

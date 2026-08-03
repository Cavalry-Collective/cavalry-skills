# CLAUDE.md

## Demo recordings (README GIFs)

Use these dimensions for every demo recording — they were tuned so the text
reads clearly in the README:

- **Browser viewport 920 × 760**, and export the GIF at native resolution —
  never downscale the frames.
- **Review the demo page at phone width** (the workspace's 390px size) with the
  canvas zoom locked at 100%. The workspace refits zoom on every version load
  (size switch, Review changes, timeline scrub), so a recording script must
  pin it — set zoom to 1 and no-op the refit for the session.
- Keep the subject app trivially simple (the todo list works well) so the
  before/after change is obvious at a glance.
- Keep it snappy: fast typing, short holds, ~1.4× speedup at assembly, and
  clamp idle gaps (e.g. the round-trip wait) to ~0.5s.
- Target: ~12 seconds, under 1 MB, saved to `docs/screens/wireframe-demo.gif`.

Recordings are scripted — headless Chrome via playwright-core driving the real
review server end to end (publish v1, comment, send, claim, publish v2), with
frames captured as JPEGs and assembled with ffmpeg (two-pass palette).

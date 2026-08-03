/*
 * workdir.mjs — where a tool keeps its per-machine working files.
 *
 * One answer for every engine: `<root>/.vstack/local/<tool>/`. A project grows
 * one dot-directory instead of one per engine, and the split inside it is the
 * one that matters — `.vstack/local/` is this machine mid-flight and is
 * gitignored whole; everything else under `.vstack/` (pipeline.json, specs/,
 * build/) is the pipeline and belongs in the repo. Adding an engine costs no
 * new `.gitignore` line, and `local/spec/` can't be mistaken for `specs/`.
 *
 * `root` is the artifact's own directory, so state still sits beside the thing
 * it belongs to — a review of `design/login.html` lands in
 * `design/.vstack/local/wireframe/login/`, and moving the page moves its review
 * with it. The one exception is an artifact that already lives inside a
 * `.vstack` directory: the spec tree writes `.vstack/specs/<feature>.json`, and
 * hanging `.vstack/specs/.vstack/` off it would nest the same name twice. When
 * the artifact is already under a `.vstack`, that one is used.
 */

import fs from 'node:fs'
import path from 'node:path'

/** The directory every tool's working files sit under, and the only thing in
    `.vstack/` that is gitignored. */
export const LOCAL = 'local'

/** Tool directory names. Engines take one of these rather than spelling their
    own, so a skill and the engine it calls can't disagree. */
export const TOOL = {
  wireframe: 'wireframe',
  spec: 'spec',
  storyMap: 'user-story-map',
  phaseBuild: 'phase-build',
  /* Fallback for a JSON document opened outside any of the skills above. */
  documents: 'documents',
}

/** The `.vstack` directory that governs `from` — the enclosing one if there is
    one, otherwise the one that belongs directly beside it. */
export function vstackRoot (from) {
  const start = path.resolve(from)
  for (let dir = start; ; ) {
    if (path.basename(dir) === '.vstack') return dir
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  return path.join(start, '.vstack')
}

/** Working directory for one tool: `<root>/.vstack/local/<tool>/`. */
export const workDir = (from, tool) => path.join(vstackRoot(from), LOCAL, tool)

/**
 * The same directory, but tolerant of a caller that named a different tool
 * than the one that wrote the files.
 *
 * The JSON bridge is shared by three skills and told which it is serving. If
 * `serve` is told one name and `watch` another, they resolve to different
 * directories and the link silently does nothing — the worst failure this
 * design allows. So a reader that finds no `marker` under its own tool looks
 * across the sibling tool directories before giving up. Writers always use
 * `workDir`; only readers fall back.
 */
export function findWorkDir (from, tool, marker) {
  const mine = workDir(from, tool)
  if (fs.existsSync(path.join(mine, marker))) return mine
  const local = path.join(vstackRoot(from), LOCAL)
  let siblings = []
  try { siblings = fs.readdirSync(local, { withFileTypes: true }) } catch { return mine }
  for (const e of siblings) {
    if (!e.isDirectory() || e.name === tool) continue
    if (fs.existsSync(path.join(local, e.name, marker))) return path.join(local, e.name)
  }
  return mine
}

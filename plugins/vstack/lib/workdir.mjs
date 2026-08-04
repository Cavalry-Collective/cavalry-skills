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
 * `design/.vstack/local/review/login/`, and moving the page moves its review
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
  review: 'review',
  spec: 'spec',
  storyMap: 'user-story-map',
  phaseBuild: 'phase-build',
  /* Fallback for a JSON document opened outside any of the skills above. */
  documents: 'documents',
}

/** What a tool used to write under, newest first. A tool is free to be renamed
    — the directory it already filled is not, because the rounds inside it are
    the user's, not ours. Writers only ever use the name in `TOOL`; readers try
    these when their own directory has nothing to say. */
export const LEGACY = { [TOOL.review]: ['wireframe'] }

/** Every directory name a tool's work could be under, current one first. For
    callers that enumerate rather than look one subject up. */
export const toolNames = tool => [tool, ...(LEGACY[tool] || [])]

/**
 * Where one named subject's files are: `<root>/.vstack/local/<tool>/<name>/`.
 *
 * A subject that predates a rename is still under the old directory, and moving
 * it silently would be a worse answer than reading it where it lies — so the
 * first directory that actually holds this subject wins, and a subject that
 * exists nowhere yet is created under the current name.
 */
export function subjectDir (from, tool, name) {
  const local = path.join(vstackRoot(from), LOCAL)
  for (const t of toolNames(tool)) {
    const here = path.join(local, t, name)
    if (fs.existsSync(here)) return here
  }
  return path.join(workDir(from, tool), name)
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

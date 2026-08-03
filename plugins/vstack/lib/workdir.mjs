/*
 * workdir.mjs — where a tool keeps its per-machine working files.
 *
 * One answer for every engine: `<root>/.vstack/<tool>/`. The wireframe review
 * store is `.vstack/wireframe/<name>/`; the JSON bridge's bookkeeping is
 * `.vstack/bridge/`. Grouping under the product name means a project grows one
 * dot-directory instead of one per tool, and `.gitignore` needs one line per
 * tool rather than a new entry every time an engine is added.
 *
 * `root` is the artifact's own directory, so state still sits beside the thing
 * it belongs to — a review of `design/login.html` lands in
 * `design/.vstack/wireframe/login/`, and moving the page moves its review with
 * it. The one exception is an artifact that already lives inside a `.vstack`
 * directory: the spec tree writes `.vstack/specs/<feature>.json`, and hanging
 * `.vstack/specs/.vstack/bridge/` off it would nest the same name twice. When
 * the artifact is already under a `.vstack`, that one is used.
 */

import path from 'node:path'

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

/** Working directory for one tool: `<root>/.vstack/<tool>/`. */
export const workDir = (from, tool) => path.join(vstackRoot(from), tool)

/** The tool directory names, so callers agree on the spelling. */
export const TOOL = { wireframe: 'wireframe', bridge: 'bridge' }

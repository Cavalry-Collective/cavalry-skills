#!/usr/bin/env node
/**
 * phase-view.mjs — put the phases on a scrubber, in one self-contained file.
 *
 * `phase-wireframe` writes one file per phase. Those files are the build
 * targets and stay exactly as they are; this is the way to *look* at them —
 * drag along the rail and watch the screen fill in release by release.
 *
 * It is the review workspace running in phase mode: same chrome, same browser
 * window, same scrubber, with the rail showing releases instead of versions.
 * View-only, deliberately — what a phase contains is a re-slice of the story
 * map, not an edit of this page, so nothing here writes anything.
 *
 *   node phase-view.mjs --dir design --name candidate-pipeline [--out phases.html]
 *   node phase-view.mjs --dir design --name candidate-pipeline --labels labels.json
 *
 * `--labels` is optional: { "1": { "label": "Track applicants",
 *                                  "goal": "See who applied and move them on" } }
 * Without it the phases are named Phase 1, Phase 2, … which is honest but
 * says less than the story map already knows.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.resolve(HERE, '../../wireframe/assets/workspace.html')

const args = process.argv.slice(2).reduce((o, a, i, arr) => {
  if (a.startsWith('--')) {
    const next = arr[i + 1]
    o[a.slice(2)] = next && !next.startsWith('--') ? next : true
  }
  return o
}, {})

const DIR = path.resolve(args.dir || '.')
const NAME = args.name
if (!NAME) {
  console.error('Pass --name <page> (the file name without .html), and --dir if it is not here')
  process.exit(1)
}

/* Phases are whatever phase-<n>/ directories exist beside the base, in order.
   Reading the directory rather than being told how many keeps this honest when
   a phase has not been generated yet. */
const phases = fs.readdirSync(DIR)
  .map(d => /^phase-(\d+)$/.exec(d))
  .filter(Boolean)
  .map(m => Number(m[1]))
  .sort((a, b) => a - b)
  .map(n => ({ n, file: path.join(DIR, `phase-${n}`, `${NAME}.html`) }))
  .filter(p => fs.existsSync(p.file))

if (!phases.length) {
  console.error(`No phase-<n>/${NAME}.html under ${DIR} — generate the phases first.`)
  process.exit(1)
}

let labels = {}
if (args.labels) {
  try { labels = JSON.parse(fs.readFileSync(path.resolve(args.labels), 'utf8')) }
  catch (e) { console.error(`Could not read --labels: ${e.message}`); process.exit(1) }
}

const titleOf = html => (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim()

const versions = phases.map(p => {
  const html = fs.readFileSync(p.file, 'utf8')
  const meta = labels[String(p.n)] || {}
  return {
    n: p.n,
    label: meta.label || titleOf(html).replace(/\s*—\s*Phase\s*\d+\s*$/i, '') || `Phase ${p.n}`,
    goal: meta.goal || '',
    html,
  }
})

const last = versions[versions.length - 1]
const base = fs.existsSync(path.join(DIR, `${NAME}.html`))
  ? fs.readFileSync(path.join(DIR, `${NAME}.html`), 'utf8')
  : last.html

/* The last phase is the full design — if it is the base, say so by showing the
   base itself, so the end of the rail is the thing everyone signed off. */
const bundle = {
  mode: 'phase',
  name: titleOf(base).replace(/\s*—\s*Phase\s*\d+\s*$/i, '') || NAME,
  fileName: `${NAME}.html`,
  currentVersion: last.n,
  html: last.html,
  versions,
  reviews: {},
}

const shell = fs.readFileSync(WORKSPACE, 'utf8')
// `<` only occurs inside JSON strings here, so escaping it wholesale is safe and
// stops any `</script>` in the wireframe markup from closing our data island.
const json = JSON.stringify(bundle).replace(/</g, '\\u003c')
let out = shell.replace(
  '<script id="bundle" type="application/json">null</script>',
  () => `<script id="bundle" type="application/json">${json}</script>`
)
if (out === shell) {
  console.error('Could not find the bundle placeholder in workspace.html')
  process.exit(1)
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${esc(bundle.name)} — Phases · Visual Stack</title>`)

const dest = path.resolve(args.out || path.join(DIR, `${NAME}-phases.html`))
fs.writeFileSync(dest, out)

const kb = Math.round(Buffer.byteLength(out) / 1024)
console.log(`${versions.length} phase(s) → ${dest} (${kb} KB)`)
for (const v of versions) console.log(`  P${v.n}  ${v.label}${v.goal ? ` — ${v.goal}` : ''}`)

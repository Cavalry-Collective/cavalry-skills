#!/usr/bin/env node
/**
 * bundle-artifact.mjs — flatten a review into ONE self-contained file.
 *
 * The local loop needs a server (same-origin page, POST-back feedback). To
 * put the same workspace in front of someone who is not at this machine, we
 * inline the page and its published versions into the workspace and switch the
 * send button to "copy for Claude". Output is CSP-safe: no external fonts,
 * scripts, styles or fetches — publishable as a Claude Artifact as-is.
 *
 *   node bundle-artifact.mjs --file <page.html> [--out review.html] [--versions 3]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subjectDir, TOOL } from '../../../lib/workdir.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2).reduce((o, a, i, arr) => {
  if (a.startsWith('--')) {
    const next = arr[i + 1]
    o[a.slice(2)] = next && !next.startsWith('--') ? next : true
  }
  return o
}, {})

const FILE = path.resolve(args.file || '')
if (!args.file || !fs.existsSync(FILE)) {
  console.error('Pass --file <page.html>')
  process.exit(1)
}
const DIR = path.dirname(FILE)
const NAME = path.basename(FILE).replace(/\.html?$/i, '')
const STORE = subjectDir(DIR, TOOL.review, NAME)

const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const html = fs.readFileSync(FILE, 'utf8')
const state = readJSON(path.join(STORE, 'state.json'), { version: 1 })
const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
const name = (titleMatch && titleMatch[1].trim()) || NAME

/* Published versions, newest first, capped so the bundle stays a sane size. */
const keep = Number(args.versions || 3)
const vdir = path.join(STORE, 'versions')
let versions = []
if (fs.existsSync(vdir)) {
  versions = fs.readdirSync(vdir)
    .map(f => /^v(\d+)\.html$/.exec(f))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .sort((a, b) => b - a)
    .slice(0, keep)
    .map(n => ({
      ...readJSON(path.join(vdir, `v${n}.meta.json`), { n, label: `Version ${n}` }),
      n,
      html: fs.readFileSync(path.join(vdir, `v${n}.html`), 'utf8'),
    }))
    .sort((a, b) => a.n - b.n)
}

/* Reviews so far, so the shared copy shows what is already answered. */
const reviews = {}
const rdir = path.join(STORE, 'reviews')
if (fs.existsSync(rdir)) {
  for (const d of fs.readdirSync(rdir)) {
    const m = /^v(\d+)$/.exec(d)
    if (!m) continue
    const saved = readJSON(path.join(rdir, d, 'annotations.json'))
    if (saved) reviews[m[1]] = saved
  }
}

const bundle = {
  mode: 'artifact',
  name,
  fileName: path.basename(FILE),
  currentVersion: state.version || 1,
  html, versions, reviews,
}

const shell = fs.readFileSync(path.join(HERE, 'workspace.html'), 'utf8')
// `<` only occurs inside JSON strings here, so escaping it wholesale is safe and
// stops any `</script>` in the wireframe markup from closing our data island.
const json = JSON.stringify(bundle).replace(/</g, '\\u003c')

/* Replacer callbacks, not replacement strings — a page containing `$$` or `$&`
   would otherwise have them interpreted as replacement patterns and the bundle
   silently corrupted. */
let out = shell.replace(
  '<script id="bundle" type="application/json">null</script>',
  () => `<script id="bundle" type="application/json">${json}</script>`
)
if (out === shell) {
  console.error('Could not find the bundle placeholder in workspace.html')
  process.exit(1)
}
/* The workspace sets its title from the page once it boots, but a published
   Artifact is catalogued by the <title> in the file — so a bundle that ships the
   placeholder gets filed under "Review" alongside every other one. Name it. */
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const titled = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${esc(name)} — Review · Visual Stack</title>`)
if (titled === out) console.error('warning: no <title> to name — the Artifact will be filed under the workspace default')
out = titled

const dest = path.resolve(args.out || path.join(DIR, `${NAME}-review.html`))
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, out)

const kb = Math.round(Buffer.byteLength(out) / 1024)
console.log(`Bundled ${name} + ${versions.length} version(s) → ${dest} (${kb} KB)`)
if (kb > 900) console.log('Large bundle — pass --versions 1 to drop older versions.')

#!/usr/bin/env node
/*
 * build-shell.mjs — put the shared shell into every page, and keep it there.
 *
 * vstack's pages have to be self-contained: the same file is served over
 * http, opened straight off disk, and inlined into an Artifact under a CSP
 * that blocks every external request. Nothing can be linked at runtime, so a
 * shared component has to be *stamped in* rather than imported.
 *
 * `lib/shell/` is the source of truth. This copies it into each page between
 * markers, and can check that no page has drifted from it:
 *
 *   node build-shell.mjs stamp            write the shell into every page
 *   node build-shell.mjs check            exit 1 if any page is out of date
 *   node build-shell.mjs stamp --page <f> just that one
 *
 * A page opts in per block, by carrying the markers:
 *
 *   <style>  ...  /* vstack:shell tokens *\/ ... /* /vstack:shell tokens *\/
 *   <body>   ...  <!-- vstack:shell topbar --> ... <!-- /vstack:shell topbar -->
 *
 * Everything between a pair is generated and will be overwritten. The one
 * exception is a slot: content between `<!-- vstack:slot NAME -->` and its
 * closer is the page's own, and is carried across each stamp. That is how the
 * board keeps its subject tabs and the workspace its size switcher while both
 * take the same bar.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHELL = path.join(HERE, 'shell')
const ROOT = path.join(HERE, '..')

/* Every page that wears the shell. Adding one here is the whole registration. */
const PAGES = [
  'skills/review/assets/workspace.html',
  'experimental/spec/assets/spec-tree.html',
  'experimental/phase-build/assets/build-board.html',
  'skills/user-story-map/assets/story-map-template.html',
  'experimental/start/assets/chooser.html',
].map(p => path.join(ROOT, p))

const read = f => fs.readFileSync(f, 'utf8')

/* Each block knows how it comments itself, because it lands inside <style>,
   <script> or the markup, and a comment that is wrong there is a page that
   renders its own source. The markers belong to this script — the files in
   shell/ are pure content, so a stamped page and its source never disagree
   about where a block begins. */
const BLOCKS = [
  { name: 'tokens', file: 'tokens.css', style: 'css' },
  { name: 'css', file: 'shell.css', style: 'css' },
  // Only the pages that scrub something carry these — the marker is the opt-in.
  { name: 'scrubber-css', file: 'scrubber.css', style: 'css' },
  { name: 'topbar', file: 'topbar.html', style: 'html' },
  { name: 'scrubber', file: 'scrubber.html', style: 'html' },
  { name: 'js', file: 'shell.js', style: 'css' },
].map(b => ({
  ...b,
  open: b.style === 'html' ? `<!-- vstack:shell ${b.name} -->` : `/* vstack:shell ${b.name} */`,
  close: b.style === 'html' ? `<!-- /vstack:shell ${b.name} -->` : `/* /vstack:shell ${b.name} */`,
}))

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* The opening marker is matched loosely — anything from `vstack:shell <name>`
   to the end of that comment — so a page stamped by an older version of this
   script, which let the block's own prose run on past the marker, is still
   found and rewritten into the canonical form. The closing marker is exact. */
const region = b => new RegExp(
  (b.style === 'html'
    ? '<!-- vstack:shell ' + b.name + '[\\s\\S]*?-->'
    : '\\/\\* vstack:shell ' + b.name + '[\\s\\S]*?\\*\\/') +
  '[\\s\\S]*?' + esc(b.close)
)

/** The page's own markup inside a slot, so a stamp never eats it. */
function slots (text) {
  const out = new Map()
  const re = /<!-- vstack:slot ([\w-]+) -->([\s\S]*?)<!-- \/vstack:slot \1 -->/g
  let m
  while ((m = re.exec(text))) out.set(m[1], m[2])
  return out
}

function withSlots (body, keep) {
  return body.replace(/<!-- vstack:slot ([\w-]+) -->([\s\S]*?)<!-- \/vstack:slot \1 -->/g,
    (whole, name, fresh) => keep.has(name)
      ? `<!-- vstack:slot ${name} -->${keep.get(name)}<!-- /vstack:slot ${name} -->`
      : whole)
}

function stampOne (file) {
  const before = read(file)
  let after = before
  const keep = slots(before)
  const applied = []
  for (const b of BLOCKS) {
    const re = region(b)
    if (!re.test(after)) continue          // this page doesn't take this block
    const body = withSlots(read(path.join(SHELL, b.file)).replace(/\s+$/, ''), keep)
    after = after.replace(re, () => `${b.open}\n${body}\n${b.close}`)
    applied.push(b.name)
  }
  return { file, before, after, applied, changed: before !== after }
}

const cmd = process.argv[2] || 'stamp'
const only = process.argv.includes('--page') ? process.argv[process.argv.indexOf('--page') + 1] : null
const targets = only ? [path.resolve(only)] : PAGES

if (!['stamp', 'check'].includes(cmd)) {
  console.error('stamp | check  [--page <file>]')
  process.exit(2)
}

let drifted = 0
for (const f of targets) {
  if (!fs.existsSync(f)) { console.error(`missing page: ${f}`); process.exit(2) }
  const r = stampOne(f)
  const rel = path.relative(path.join(HERE, '..'), f)
  if (!r.applied.length) { console.log(`—  ${rel} (no shell markers)`); continue }
  if (cmd === 'check') {
    if (r.changed) { console.error(`✗  ${rel} — drifted from lib/shell (${r.applied.join(', ')})`); drifted++ }
    else console.log(`✓  ${rel}`)
    continue
  }
  if (r.changed) fs.writeFileSync(f, r.after)
  console.log(`${r.changed ? '↻' : '='}  ${rel} — ${r.applied.join(', ')}`)
}

if (cmd === 'check' && drifted) {
  console.error(`\n${drifted} page(s) out of date. Run: node lib/build-shell.mjs stamp`)
  process.exit(1)
}

#!/usr/bin/env node
/*
 * check-subtraction.mjs — prove a phase screen is a pure subtraction of its base.
 *
 * Three checks, all mechanical:
 *
 *   1. CSS is untouched      every <style> block is byte-identical to the base's.
 *                            Subtracting elements never edits styles; if the CSS moved,
 *                            something was restyled.
 *   2. Nothing invented      every element in the phase file also exists in the base,
 *                            counted — so a duplicated element fails too. The only
 *                            exception is an element marked data-phase-skeleton, which
 *                            is the allowance for replacing a later-phase gate.
 *   3. Nothing moved         the surviving elements appear in the same relative order as
 *                            in the base — i.e. they form a subsequence. Reordering,
 *                            reparenting and hoisting all break this.
 *
 * It does NOT check copy or data: two elements with the same tag/id/class but different
 * text read the same here. Read the diff for that.
 *
 * Usage:
 *   node check-subtraction.mjs --base design/app.html --phase design/phase-1/app.html
 *   node check-subtraction.mjs --base … --phase … --json
 *
 * Exit code 0 = pure subtraction, 1 = violations found, 2 = bad invocation.
 */

import fs from 'node:fs'

// ── args ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}
const basePath = arg('--base')
const phasePath = arg('--phase')
const asJson = argv.includes('--json')

if (!basePath || !phasePath) {
  console.error('usage: check-subtraction.mjs --base <file.html> --phase <file.html> [--json]')
  process.exit(2)
}
for (const p of [basePath, phasePath]) {
  if (!fs.existsSync(p)) {
    console.error(`not found: ${p}`)
    process.exit(2)
  }
}

const baseHtml = fs.readFileSync(basePath, 'utf8')
const phaseHtml = fs.readFileSync(phasePath, 'utf8')

// ── parsing ───────────────────────────────────────────────────────────────────

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '')

/** Concatenated contents of every <style> block, in document order. */
const styles = (html) =>
  [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n/*—*/\n')

/** Blank out <script> and <style> bodies so their contents aren't read as markup. */
const stripRawText = (html) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>')

const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

const attr = (attrs, name) => {
  const m = attrs.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  )
  if (m) return m[1] ?? m[2] ?? m[3] ?? ''
  // valueless attribute, e.g. <div data-phase-skeleton>
  return new RegExp(`(?:^|\\s)${name}(?=[\\s/>]|$)`, 'i').test(attrs) ? '' : null
}

/**
 * One element → a stable signature: tag, id, and sorted classes. Classes are sorted so
 * that a reordered class list isn't reported as an invented element — it isn't one.
 */
const signature = (tag, attrs) => {
  const id = attr(attrs, 'id')
  const cls = (attr(attrs, 'class') || '').trim().split(/\s+/).filter(Boolean).sort()
  return tag.toLowerCase() + (id ? `#${id}` : '') + (cls.length ? `.${cls.join('.')}` : '')
}

/** Every open tag in document order, with its signature and whether it's a skeleton. */
function elements(html) {
  const clean = stripRawText(stripComments(html))
  const out = []
  for (const m of clean.matchAll(OPEN_TAG)) {
    const [, tag, attrs = ''] = m
    out.push({
      sig: signature(tag, attrs),
      skeleton: attr(attrs, 'data-phase-skeleton') !== null,
      at: m.index,
    })
  }
  return out
}

// ── checks ────────────────────────────────────────────────────────────────────

const failures = []
const base = elements(baseHtml)
const phase = elements(phaseHtml)
const skeletons = phase.filter((e) => e.skeleton)
const kept = phase.filter((e) => !e.skeleton)

// 1 · CSS untouched
const baseCss = styles(baseHtml)
const phaseCss = styles(phaseHtml)
if (baseCss !== phaseCss) {
  const bl = baseCss.split('\n')
  const pl = phaseCss.split('\n')
  let i = 0
  while (i < bl.length && i < pl.length && bl[i] === pl[i]) i++
  failures.push({
    check: 'css-untouched',
    detail:
      `the <style> blocks differ from the base — first divergence at line ${i + 1}\n` +
      `      base:  ${(bl[i] ?? '<end of file>').trim().slice(0, 90)}\n` +
      `      phase: ${(pl[i] ?? '<end of file>').trim().slice(0, 90)}`,
    hint: 'subtraction never edits CSS. Restore the base stylesheet verbatim; unused rules are fine to leave.',
  })
}

// 2 · nothing invented (count-aware, so duplication fails too)
const baseCounts = new Map()
for (const e of base) baseCounts.set(e.sig, (baseCounts.get(e.sig) || 0) + 1)
const seen = new Map()
const invented = []
for (const e of kept) {
  const n = (seen.get(e.sig) || 0) + 1
  seen.set(e.sig, n)
  if (n > (baseCounts.get(e.sig) || 0)) invented.push(e.sig)
}
if (invented.length) {
  const uniq = [...new Set(invented)]
  failures.push({
    check: 'nothing-invented',
    detail:
      `${invented.length} element(s) are not in the base, or appear more often than in it:\n` +
      uniq.slice(0, 12).map((s) => `      ${s}`).join('\n') +
      (uniq.length > 12 ? `\n      … and ${uniq.length - 12} more` : ''),
    hint: 'only subtract. A placeholder standing in for a later-phase gate must carry data-phase-skeleton.',
  })
}

// 3 · nothing moved — kept elements must be a subsequence of the base
let bi = 0
let stuck = null
for (const e of kept) {
  const from = bi
  while (bi < base.length && base[bi].sig !== e.sig) bi++
  if (bi === base.length) {
    stuck = { sig: e.sig, searchedFrom: from }
    break
  }
  bi++
}
if (stuck && !invented.includes(stuck.sig)) {
  failures.push({
    check: 'nothing-moved',
    detail:
      `element order diverges from the base at ${stuck.sig} — it appears earlier in the phase ` +
      `file than it does in the base, so something was moved, reparented or hoisted.`,
    hint: 'keep every surviving element exactly where it was. Remove around it, never rearrange.',
  })
}

// ── report ────────────────────────────────────────────────────────────────────

const summary = {
  base: basePath,
  phase: phasePath,
  baseElements: base.length,
  keptElements: kept.length,
  removedElements: base.length - kept.length,
  skeletons: skeletons.length,
  pass: failures.length === 0,
  failures: failures.map(({ check, detail }) => ({ check, detail })),
}

if (asJson) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.pass ? 0 : 1)
}

const net = summary.removedElements
const pct = base.length ? Math.round((Math.abs(net) / base.length) * 100) : 0
const delta = net >= 0 ? `${net} removed (${pct}%)` : `${-net} MORE than the base`
console.log(`${basePath}  →  ${phasePath}`)
console.log(
  `  ${summary.keptElements} kept · ${delta} · ` +
    `${summary.skeletons} skeleton${summary.skeletons === 1 ? '' : 's'}`,
)
if (summary.pass) {
  console.log('  ✓ pure subtraction — CSS untouched, nothing invented, nothing moved')
  process.exit(0)
}
console.log('')
for (const f of failures) {
  console.log(`  ✗ ${f.check}`)
  console.log(`      ${f.detail}`)
  console.log(`      → ${f.hint}`)
}
process.exit(1)

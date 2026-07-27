#!/usr/bin/env node
/**
 * review-server.mjs — the local half of the ui-review loop.
 *
 * You point it at one HTML file — a mockup, an exported screen, any page you
 * want eyes on. It serves that file inside the review workspace so the two
 * share an origin, keeps a version history beside it, and gives the workspace
 * somewhere to push feedback that Claude picks up without any copy-paste.
 *
 * Node >= 18, standard library only.
 *
 *   node review-server.mjs serve   --file <page.html> [--port 7788] [--idle-timeout 90]
 *   node review-server.mjs publish --file <page.html> --label "…" [--addressed c1,c3]
 *   node review-server.mjs reply   --file <page.html> --comment <id> --text "…"
 *   node review-server.mjs status  --file <page.html>
 *
 * State lives in a sibling directory, out of the way of the page:
 *   <dir>/.ui-review/<name>/
 *     state.json            { name, version }
 *     versions/v<n>.html    frozen copy of each published version
 *     reviews/v<n>/         annotations.json · feedback.json · feedback.md
 *     pending               sentinel written on send, watched by Claude
 *     url                   the live URL — present only while the server runs
 *
 * The server closes itself when the browser tab does: the workspace holds an
 * SSE connection, and once the last one goes away and none returns within the
 * grace period the server removes `url` and exits. That exit re-invokes Claude
 * and ends the waiter, so nothing is left listening.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ────────────────────────────── args ────────────────────────────── */

function parseArgs (argv) {
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv.shift() : 'serve'
  const out = { _: cmd }
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i++ }
  }
  return out
}
const args = parseArgs(process.argv.slice(2))

const FILE = path.resolve(args.file || args.root || '')
if (!args.file && !args.root) {
  console.error('Which file? Pass --file <page.html>')
  process.exit(1)
}
if (!fs.existsSync(FILE) || !fs.statSync(FILE).isFile()) {
  console.error(`Not a file: ${FILE}`)
  process.exit(1)
}
const DIR = path.dirname(FILE)
const NAME = path.basename(FILE).replace(/\.html?$/i, '')
const STORE = path.join(DIR, '.ui-review', NAME)

const P = {
  state: () => path.join(STORE, 'state.json'),
  versions: () => path.join(STORE, 'versions'),
  version: n => path.join(STORE, 'versions', `v${n}.html`),
  review: n => path.join(STORE, 'reviews', `v${n}`),
  pending: () => path.join(STORE, 'pending'),
  url: () => path.join(STORE, 'url'),
}

const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeJSON = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n')
}

/** The page names itself through its <title>; the filename is the fallback. */
function pageName () {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(fs.readFileSync(FILE, 'utf8'))
  const t = m && m[1].trim()
  return t || NAME
}
const loadState = () => readJSON(P.state(), { version: 0 })
const saveState = s => writeJSON(P.state(), s)

function listVersions () {
  if (!fs.existsSync(P.versions())) return []
  return fs.readdirSync(P.versions())
    .map(f => /^v(\d+)\.html$/.exec(f))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b)
    .map(n => readJSON(path.join(P.versions(), `v${n}.meta.json`), { n, label: `Version ${n}` }))
}

/* ──────────────────────────── publish ───────────────────────────── */

/**
 * Freeze the working file as the NEXT version and make it current, so the
 * version the workspace names always has a frozen copy behind it.
 * --replace overwrites the current version instead (for a version nobody has
 * reviewed yet).
 */
function cmdPublish (quiet) {
  const state = loadState()
  const replace = args.replace === true || args.replace === 'true'
  const n = replace ? Math.max(1, state.version) : state.version + 1

  fs.mkdirSync(P.versions(), { recursive: true })
  fs.copyFileSync(FILE, P.version(n))

  const addressed = String(args.addressed || '').split(',').map(s => s.trim()).filter(Boolean)
  let hit = 0
  if (addressed.length) {
    // Feedback carries items forward, so patch every review, not just the last.
    for (const v of listVersions().map(v => v.n).concat(state.version)) {
      const f = path.join(P.review(v), 'annotations.json')
      const saved = readJSON(f)
      if (!saved?.annotations) continue
      let changed = false
      for (const a of saved.annotations) {
        if (addressed.includes(a.id) && a.status === 'open') { a.status = 'addressed'; hit++; changed = true }
      }
      if (changed) writeJSON(f, saved)
    }
  }

  const prev = readJSON(path.join(P.versions(), `v${n}.meta.json`), {}) || {}
  writeJSON(path.join(P.versions(), `v${n}.meta.json`), {
    n,
    label: args.label || prev.label || (n === 1 ? 'Initial version' : `Version ${n}`),
    date: new Date().toISOString(),
    addressed,
  })

  state.version = n
  state.name = pageName()
  saveState(state)
  if (!quiet) console.log(`Published v${n}${hit ? ` — ${hit} item(s) marked addressed` : ''}`)
  touch()
}

/**
 * Answer a comment in its own thread. Use it when a comment is ambiguous —
 * asking beats guessing, and the reviewer sees the question on the mark itself.
 * The comment moves to `question` until they reply, which puts it back to open.
 */
function cmdReply () {
  const id = args.comment
  const text = args.text
  if (!id || !text) {
    console.error('Need --comment <id> --text "…"')
    process.exit(1)
  }
  const state = loadState()
  for (const v of listVersions().map(v => v.n).concat(state.version)) {
    const f = path.join(P.review(v), 'annotations.json')
    const saved = readJSON(f)
    const target = saved?.annotations?.find(a => a.id === id)
    if (!target) continue
    target.replies = (target.replies || []).concat({
      by: 'claude', text, at: new Date().toISOString(),
    })
    if (args.status !== 'open') target.status = 'question'
    writeJSON(f, saved)
    console.log(`Replied to ${id} on v${v} — the reviewer will see it on the comment`)
    touch()
    return
  }
  console.error(`No comment ${id} found`)
  process.exit(1)
}

function cmdStatus () {
  const state = loadState()
  console.log(JSON.stringify({
    file: FILE,
    name: pageName(),
    version: state.version,
    versions: listVersions().map(v => `v${v.n}: ${v.label}`),
    pendingReview: fs.existsSync(P.pending()) ? readJSON(P.pending(), {}) : null,
  }, null, 2))
}

/* ───────────────────────────── serve ────────────────────────────── */

const clients = new Set()
let reloadTimer = null
/* Live-page bookkeeping, so the server can close itself when the tab does. */
let everConnected = false
let idleSince = null
function broadcast (event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) { try { res.write(payload) } catch {} }
}
function touch () {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => broadcast('reload', { at: Date.now() }), 120)
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2',
}
const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}
const sendJSON = (res, code, obj) => send(res, code, JSON.stringify(obj), MIME['.json'])

function readBody (req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c; if (raw.length > 32e6) { reject(new Error('body too large')); req.destroy() } })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

function payload () {
  const state = loadState()
  const versions = listVersions()
  const reviews = {}
  for (const v of versions.concat([{ n: state.version }])) {
    const saved = readJSON(path.join(P.review(v.n), 'annotations.json'))
    if (saved) reviews[v.n] = saved
  }
  return {
    mode: 'local',
    name: pageName(),
    fileName: path.basename(FILE),
    currentVersion: state.version,
    html: fs.readFileSync(FILE, 'utf8'),
    versions, reviews,
  }
}

/**
 * The workspace autosaves its whole list, so a reply written here between its
 * last fetch and its next save would be lost. The stored thread wins on length,
 * and a client can never un-address a comment.
 */
function mergeIncoming (n, incoming) {
  const stored = readJSON(path.join(P.review(n), 'annotations.json'))?.annotations
  if (!stored?.length) return incoming
  const byId = new Map(stored.map(a => [a.id, a]))
  return incoming.map(a => {
    const prev = byId.get(a.id)
    if (!prev) return a
    const merged = { ...a }
    if ((prev.replies || []).length > (a.replies || []).length) merged.replies = prev.replies
    if (prev.status === 'addressed' && a.status !== 'addressed') merged.status = 'addressed'
    return merged
  })
}

function serveStatic (res, file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found')
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
}
/** Resolve a request path inside a base dir, refusing anything that escapes. */
function safeJoin (base, rel) {
  const t = path.resolve(base, '.' + path.posix.normalize('/' + rel))
  return t === base || t.startsWith(base + path.sep) ? t : null
}

async function handle (req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = decodeURIComponent(url.pathname)

  if (p === '/' || p === '/index.html') return serveStatic(res, path.join(HERE, 'workspace.html'))
  if (p === '/page') return serveStatic(res, FILE)
  if (p === '/api/project') {
    try { return sendJSON(res, 200, payload()) } catch (e) { return sendJSON(res, 500, { error: String(e) }) }
  }
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('retry: 1000\n\n')
    clients.add(res)
    everConnected = true
    idleSince = null
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
      if (!clients.size) idleSince = Date.now()
    })
    return
  }
  const vm = p.match(/^\/api\/version\/(\d+)$/)
  if (vm) {
    const f = P.version(Number(vm[1]))
    return fs.existsSync(f) ? serveStatic(res, f) : send(res, 404, '')
  }
  if (p === '/api/annotations' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    writeJSON(path.join(P.review(n), 'annotations.json'), {
      version: n, updatedAt: new Date().toISOString(),
      annotations: mergeIncoming(n, body.annotations || []),
    })
    return sendJSON(res, 200, { ok: true })
  }
  if (p === '/api/feedback' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    const dir = P.review(n)
    fs.mkdirSync(dir, { recursive: true })
    writeJSON(path.join(dir, 'annotations.json'), {
      version: n, updatedAt: new Date().toISOString(), annotations: body.annotations || [],
    })
    writeJSON(path.join(dir, 'feedback.json'), body.feedback || {})
    fs.writeFileSync(path.join(dir, 'feedback.md'), body.markdown || '')
    writeJSON(P.pending(), {
      page: FILE,
      name: pageName(),
      version: n,
      counts: body.counts || {},
      feedback: path.join(dir, 'feedback.md'),
      sentAt: new Date().toISOString(),
    })
    console.log(`\n● Review sent for v${n} — ${body.counts?.total ?? '?'} comment(s) → ${path.join(dir, 'feedback.md')}`)
    return sendJSON(res, 200, { ok: true })
  }

  // Anything the page references (images, shared css) resolves beside it.
  const f = safeJoin(DIR, p)
  if (f && fs.existsSync(f) && !fs.statSync(f).isDirectory()) return serveStatic(res, f)
  const asset = safeJoin(HERE, p)
  if (asset && fs.existsSync(asset) && !fs.statSync(asset).isDirectory()) return serveStatic(res, asset)
  return send(res, 404, 'Not found')
}

function cmdServe () {
  // Serving an unpublished page would name a version with no frozen copy.
  if (loadState().version === 0) cmdPublish(true)
  const port = Number(args.port || 7788)
  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => { try { sendJSON(res, 500, { error: String(e) }) } catch {} })
  })
  try { fs.watch(DIR, (_e, name) => { if (name === path.basename(FILE)) touch() }) } catch {}
  // Replies written by `reply` have to reach an open workspace too.
  try { fs.mkdirSync(path.join(STORE, 'reviews'), { recursive: true }) } catch {}
  try { fs.watch(path.join(STORE, 'reviews'), { recursive: true }, () => touch()) } catch {}

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${port} is in use — a review server may already be running there.`)
      process.exit(2)
    }
    throw e
  })
  const url = `http://localhost:${port}/`

  /* Dropping the url file tells the session's waiter the link is over, so it
     stops waiting instead of hanging until its timeout. */
  const close = why => {
    try { fs.rmSync(P.url(), { force: true }) } catch {}
    console.log(`closed (${why})`)
    process.exit(0)
  }

  const idleTimeout = args['idle-timeout'] === undefined ? 90 : Number(args['idle-timeout'])
  if (idleTimeout > 0) {
    setInterval(() => {
      if (!everConnected || clients.size || idleSince === null) return
      if (Date.now() - idleSince > idleTimeout * 1000) {
        console.log(`no tab for ${idleTimeout}s — closing the review`)
        close('tab closed')
      }
    }, 2000).unref?.()
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => close(sig.toLowerCase()))

  server.listen(port, '127.0.0.1', () => {
    fs.mkdirSync(STORE, { recursive: true })
    fs.writeFileSync(P.url(), url + '\n')
    console.log(`ui-review · ${pageName()} · v${loadState().version}`)
    console.log(`  workspace  ${url}`)
    console.log(`  page       ${FILE}`)
    console.log(idleTimeout > 0
      ? `  ready — closes itself ${idleTimeout}s after the tab does`
      : '  ready — stays up until stopped')
  })
}

switch (args._) {
  case 'publish': case 'snapshot': cmdPublish(); break
  case 'reply': cmdReply(); break
  case 'status': cmdStatus(); break
  case 'serve': cmdServe(); break
  default:
    console.error(`Unknown command "${args._}". Use: serve | publish | reply | status`)
    process.exit(1)
}

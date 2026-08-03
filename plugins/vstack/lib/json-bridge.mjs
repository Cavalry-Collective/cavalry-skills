#!/usr/bin/env node
/*
 * json-bridge.mjs — the shared live link for vstack's JSON-document pages.
 *
 * One JSON file is the artifact; a self-contained page edits it. This bridge
 * connects the two to a Claude session in both directions:
 *
 *   page → session   POST /save writes the JSON and bumps a seq counter; a
 *                    background waiter in the session watches the counter and
 *                    wakes Claude when it moves.
 *   session → page   Claude rewrites the JSON (directly, or with `patch`); a
 *                    1s stat+hash poll pushes the whole document over SSE.
 *                    The page's own save never echoes back (hash guard).
 *
 * Generalized from the story map's bridge.py — same seq/url files, same idle
 * watchdog, same token, same injection trick — so `spec` and `phase-build`
 * share one engine instead of growing a third and fourth copy.
 *
 *   node json-bridge.mjs serve --json <doc.json> --template <page.html>
 *        [--port 0] [--idle-timeout 90] [--name <label>]
 *   node json-bridge.mjs patch --json <doc.json> --id <nodeId> --set k=v [--set k=v ...]
 *   node json-bridge.mjs watch --json <doc.json> [--seq <n>]   (blocks; heartbeats presence)
 *
 * serve injects `window.__VSTACK_BRIDGE__ = {token, doc, save, events, history,
 * name}` ahead of the template; opened off disk the template sees no handle and
 * works standalone. Every version the document passes through is kept beside it,
 * so a reload doesn't lose the trail:
 *
 *   GET /history      the index — [{n, origin, at}], oldest first
 *   GET /history/<n>  that version's document
 *
 * `origin` is who moved it: `opened` (the state the link started in), `sent`
 * (the page pressed Send) or `claude` (the session rewrote the file). The page
 * labels them; the server only records what happened.
 *
 * Bookkeeping lives in <json-dir>/.vstack/bridge/<stem>.{seq,url} and
 * <stem>.history/ — or, when the document is already under a `.vstack`
 * directory (the spec tree writes `.vstack/specs/`), in that one's `bridge/`.
 * Watching, from the skill instructions — one line of stdout per event, run
 * under the Monitor tool so it never has to be restarted:
 *
 *   node json-bridge.mjs watch --json <doc.json> --stream --seq <printed seq>
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { checkForUpdate, withUpdate } from './update-check.mjs'
import { workDir, TOOL } from './workdir.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'serve'
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const args = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : [])

const JSON_PATH = arg('--json', null)
if (!JSON_PATH) { console.error('--json <doc.json> is required'); process.exit(2) }
const DOC = path.resolve(JSON_PATH)

const sha = s => crypto.createHash('sha256').update(s).digest('hex')

function writeAtomic (file, text) {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

/* ── patch — set fields on a node found by id, anywhere in the tree ── */
if (cmd === 'patch') {
  const id = arg('--id', null)
  const sets = args('--set')
  if (!id || !sets.length) { console.error('patch needs --id <nodeId> and at least one --set k=v'); process.exit(2) }
  const doc = JSON.parse(fs.readFileSync(DOC, 'utf8'))
  let hit = null
  ;(function find (x) {
    if (hit || x === null || typeof x !== 'object') return
    if (!Array.isArray(x) && x.id === id) { hit = x; return }
    for (const v of Array.isArray(x) ? x : Object.values(x)) find(v)
  })(doc)
  if (!hit) { console.error(`no node with id "${id}" in ${DOC}`); process.exit(1) }
  for (const s of sets) {
    const eq = s.indexOf('=')
    if (eq === -1) { console.error(`--set wants k=v, got "${s}"`); process.exit(2) }
    const k = s.slice(0, eq); let v = s.slice(eq + 1)
    try { v = JSON.parse(v) } catch { /* plain string */ }
    hit[k] = v
  }
  writeAtomic(DOC, JSON.stringify(doc, null, 2))
  console.log(`patched ${id}: ${sets.join(' ')}`)
  process.exit(0)
}

/* ── watch — wait for the page, and say so on it while waiting ──
   Replaces the shell `until [ "$(cat seq)" != "$N" ]` loop the skills used to
   describe, and adds the half that was missing: a heartbeat the page can see,
   so its link dot can tell "this server is up" from "someone will read what I
   send". Exits as soon as there is something to do. */
if (cmd === 'watch') {
  const dir = workDir(path.dirname(DOC), TOOL.bridge)
  const stem = path.basename(DOC, '.json')
  const F = {
    seq: path.join(dir, stem + '.seq'),
    url: path.join(dir, stem + '.url'),
    approved: path.join(dir, stem + '.approved'),
    watching: path.join(dir, stem + '.watching'),
  }
  const readSeq = () => { try { return fs.readFileSync(F.seq, 'utf8').trim() } catch { return '0' } }
  const from = arg('--seq', null) ?? readSeq()
  const beat = setInterval(() => {
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(F.watching, String(Date.now())) } catch {}
  }, 2000)
  const stop = () => { clearInterval(beat); fs.rmSync(F.watching, { force: true }) }
  process.on('SIGINT', () => { stop(); process.exit(130) })
  process.on('SIGTERM', () => { stop(); process.exit(143) })
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(F.watching, String(Date.now())) } catch {}
  /* --stream never exits: one line of stdout is one event, which is the shape
     the Monitor tool consumes and the shape every other file watcher has. The
     one-shot form below has to exit to be heard, which makes re-arming a step
     someone has to remember — and it gets forgotten. */
  const streaming = argv.includes('--stream')
  let at = from
  console.log(streaming ? `WATCHING  ${stem} from seq ${at}` : `watching ${stem} from seq ${at}`)
  /* Top-level await, deliberately: scheduling a callback here would let the
     rest of this file — the whole serve path, template check and all — run on
     underneath the waiter. */
  let announced = false
  while (true) {
    if (fs.existsSync(F.approved)) {
      if (!announced) {
        console.log(`APPROVED  ${stem} · read ${F.approved}`)
        announced = true
        if (!streaming) { stop(); process.exit(0) }
      }
    } else announced = false
    if (!fs.existsSync(F.url)) { stop(); console.log(`CLOSED    ${stem} · the link is over`); process.exit(0) }
    const now = readSeq()
    if (now !== at) {
      at = now
      console.log(`SENT      ${stem} · seq ${now} · read ${DOC}`)
      if (!streaming) { stop(); process.exit(0) }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
}
if (cmd !== 'serve') { console.error(`unknown command "${cmd}" — serve, watch or patch`); process.exit(2) }

/* ── serve ── */
const TEMPLATE = arg('--template', null)
if (!TEMPLATE || !fs.existsSync(TEMPLATE)) { console.error('--template <page.html> is required and must exist'); process.exit(2) }
if (!fs.existsSync(DOC)) { console.error(`--json file not found: ${DOC} — write the document first`); process.exit(2) }
const PORT = Number(arg('--port', 0))
const IDLE = Number(arg('--idle-timeout', 90))
const NAME = arg('--name', path.basename(DOC, '.json'))

const BRIDGE_DIR = workDir(path.dirname(DOC), TOOL.bridge)
const STEM = path.basename(DOC, '.json')
const SEQ_FILE = path.join(BRIDGE_DIR, STEM + '.seq')
const URL_FILE = path.join(BRIDGE_DIR, STEM + '.url')
/* Sign-off, the way the review workspace has it: the document is settled and
   the link is over. A sentinel rather than a status inside the document,
   because it is a statement about the round, not about the map. */
const APPROVED_FILE = path.join(BRIDGE_DIR, STEM + '.approved')
/* Touched every couple of seconds by `watch`, deleted when it stops. A
   heartbeat rather than a flag, because the waiter can be killed without a
   chance to tidy up, and a stale marker claiming someone is listening is worse
   than no marker at all. */
const WATCH_FILE = path.join(BRIDGE_DIR, STEM + '.watching')
const WATCH_STALE_MS = 15000
const someoneWatching = () => {
  try { return Date.now() - fs.statSync(WATCH_FILE).mtimeMs < WATCH_STALE_MS } catch { return false }
}
const HIST_DIR = path.join(BRIDGE_DIR, STEM + '.history')
const HIST_INDEX = path.join(HIST_DIR, 'index.json')
fs.mkdirSync(BRIDGE_DIR, { recursive: true })
if (!fs.existsSync(SEQ_FILE)) fs.writeFileSync(SEQ_FILE, '0')
// A verdict belongs to the round that raised it — a new link starts unsigned,
// or the first waiter it arms fires on last week's approval.
fs.rmSync(APPROVED_FILE, { force: true })

/* ── history — one frozen copy per version, so a reload keeps the trail ──
   The page owns the labels; the server records only what moved the document
   and when. A version identical to the one before it is not a version. */
const readHistory = () => { try { return JSON.parse(fs.readFileSync(HIST_INDEX, 'utf8')) } catch { return [] } }
function record (origin, text) {
  const index = readHistory()
  const last = index[index.length - 1]
  if (last && last.hash === sha(text)) return last
  const entry = { n: (last?.n || 0) + 1, origin, at: new Date().toISOString(), hash: sha(text) }
  fs.mkdirSync(HIST_DIR, { recursive: true })
  writeAtomic(path.join(HIST_DIR, `v${entry.n}.json`), text)
  writeAtomic(HIST_INDEX, JSON.stringify(index.concat(entry), null, 2))
  return entry
}

const TOKEN = crypto.randomBytes(16).toString('base64url')
const okToken = url => url.searchParams.get('t') === TOKEN
const okHeader = req => req.headers['x-vstack-token'] === TOKEN

let fromPage = null                      // hash of the page's last save — never echo it back
let lastHash = sha(fs.readFileSync(DOC, 'utf8'))
let lastMtime = fs.statSync(DOC).mtimeMs

const clients = new Set()
let everConnected = false
let idleSince = Date.now()

/* Answered once at startup — see lib/update-check.mjs. */
let update = null

function page () {
  const body = fs.readFileSync(TEMPLATE, 'utf8')
  const handle = `<script>window.__VSTACK_BRIDGE__=${JSON.stringify({
    token: TOKEN, name: NAME, doc: '/doc', save: '/save', events: '/events', history: '/history',
    approve: '/approve', watching: someoneWatching(),
  })}</script>\n`
  const doc = /^\s*<!doctype/i.test(body)
    ? body.replace(/(<head[^>]*>)/i, `$1\n${handle}`)
    : `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${handle}${body}`
  return withUpdate(doc, update)
}

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', page())
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, json: DOC }))
  }

  if (req.method === 'GET' && url.pathname === '/doc') {
    if (!okToken(url) && !okHeader(req)) return send(res, 403, 'application/json', '{"error":"bad token"}')
    return send(res, 200, 'application/json', fs.readFileSync(DOC, 'utf8'))
  }

  if (req.method === 'GET' && url.pathname === '/history') {
    if (!okToken(url) && !okHeader(req)) return send(res, 403, 'application/json', '{"error":"bad token"}')
    return send(res, 200, 'application/json', JSON.stringify(readHistory().map(({ hash, ...v }) => v)))
  }

  const hv = url.pathname.match(/^\/history\/(\d+)$/)
  if (req.method === 'GET' && hv) {
    if (!okToken(url) && !okHeader(req)) return send(res, 403, 'application/json', '{"error":"bad token"}')
    const f = path.join(HIST_DIR, `v${Number(hv[1])}.json`)
    if (!fs.existsSync(f)) return send(res, 404, 'application/json', '{"error":"no such version"}')
    return send(res, 200, 'application/json', fs.readFileSync(f, 'utf8'))
  }

  if (req.method === 'POST' && url.pathname === '/save') {
    if (!okToken(url) && !okHeader(req)) return send(res, 403, 'application/json', '{"error":"bad token"}')
    let body = ''
    req.on('data', c => { body += c; if (body.length > 8e6) req.destroy() })
    req.on('end', () => {
      let doc
      try { doc = JSON.parse(body) } catch { return send(res, 400, 'application/json', '{"error":"bad json"}') }
      if (doc === null || typeof doc !== 'object') return send(res, 400, 'application/json', '{"error":"not an object"}')
      const text = JSON.stringify(doc, null, 2)
      writeAtomic(DOC, text)
      fromPage = sha(text)
      lastHash = fromPage
      lastMtime = fs.statSync(DOC).mtimeMs
      const seq = Number(fs.readFileSync(SEQ_FILE, 'utf8') || '0') + 1
      writeAtomic(SEQ_FILE, String(seq))
      const v = record('sent', text)
      console.log(`save #${seq} from page (${body.length}b) — v${v.n}`)
      return send(res, 200, 'application/json', JSON.stringify({ ok: true, seq, version: v.n }))
    })
    return
  }

  /**
   * Sign-off. The document is settled: write the verdict, bump the seq so the
   * session's waiter wakes on it, then close — the same exit that means "tab
   * closed" now carries a reason, and Claude carries on with the map agreed.
   */
  if (req.method === 'POST' && url.pathname === '/approve') {
    if (!okToken(url) && !okHeader(req)) return send(res, 403, 'application/json', '{"error":"bad token"}')
    let body = ''
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy() })
    req.on('end', () => {
      let note = {}
      try { note = JSON.parse(body || '{}') } catch {}
      writeAtomic(APPROVED_FILE, JSON.stringify({
        name: NAME, doc: DOC, at: new Date().toISOString(), note: note.note || null,
      }, null, 2))
      const seq = Number(fs.readFileSync(SEQ_FILE, 'utf8') || '0') + 1
      writeAtomic(SEQ_FILE, String(seq))
      console.log(`\n✓ Approved — ${NAME} is signed off; the link is closing`)
      send(res, 200, 'application/json', JSON.stringify({ ok: true, seq }))
      // Let the response land before the socket goes away with the process.
      setTimeout(() => close(0), 350)
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    if (!okToken(url)) return send(res, 403, 'text/plain', 'bad token')
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    })
    res.write('retry: 1000\n\n')
    clients.add(res)
    everConnected = true
    req.on('close', () => { clients.delete(res); if (!clients.size) idleSince = Date.now() })
    return
  }

  send(res, 404, 'text/plain', 'not found')
})

/* session → page: poll the file; push whole document unless it's our own echo */
setInterval(() => {
  let st
  try { st = fs.statSync(DOC) } catch { return }
  if (st.mtimeMs === lastMtime) return
  lastMtime = st.mtimeMs
  const text = fs.readFileSync(DOC, 'utf8')
  const h = sha(text)
  if (h === lastHash || h === fromPage) { lastHash = h; return }
  lastHash = h
  try { JSON.parse(text) } catch { return }        // mid-write or invalid — next tick catches it
  const v = record('claude', text)
  const payload = 'event: push\ndata: ' + text.replace(/\n/g, '\ndata: ') + '\n\n'
  for (const c of clients) c.write(payload)
  console.log(`pushed v${v.n} to ${clients.size} client(s)`)
}, 1000)

/* keepalive — SSE clients are the only tab-alive signal we have. It carries the
   presence of a waiting Claude session too: the page's link dot should say who
   is listening, not merely that this server answered. */
let lastPresence = null
setInterval(() => {
  const now = someoneWatching()
  const line = now === lastPresence ? ': keepalive\n\n'
    : `event: presence\ndata: ${JSON.stringify({ watching: now })}\n\n`
  lastPresence = now
  for (const c of clients) c.write(line)
}, 3000)

/* idle watchdog — the tab closing is how a session knows the link ended */
if (IDLE > 0) {
  setInterval(() => {
    if (everConnected && !clients.size && Date.now() - idleSince > IDLE * 1000) {
      console.log('no tab for ' + IDLE + 's — closing the link')
      close(0)
    }
  }, 2000)
}

function close (code) {
  try { fs.rmSync(URL_FILE, { force: true }) } catch {}
  try { server.close() } catch {}
  process.exit(code)
}
process.on('SIGINT', () => close(1))
process.on('SIGTERM', () => close(1))

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `port ${PORT} is busy — pass --port` : String(e))
  process.exit(2)
})

checkForUpdate().then(u => { update = u }).catch(() => {})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`
  writeAtomic(URL_FILE, url)
  // The state the link opened in is a version like any other — unless the last
  // one recorded already is it, which is what re-serving an untouched doc means.
  record('opened', fs.readFileSync(DOC, 'utf8'))
  console.log(`${NAME} — live link up`)
  console.log(`  open ${url}`)
  console.log(`  seq  ${SEQ_FILE} (${fs.readFileSync(SEQ_FILE, 'utf8')})`)
})

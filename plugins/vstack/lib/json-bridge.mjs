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
 *
 * serve injects `window.__VSTACK_BRIDGE__ = {token, doc, save, events, name}`
 * ahead of the template; opened off disk the template sees no handle and works
 * standalone. Bookkeeping lives in <json-dir>/.vstack-bridge/<stem>.{seq,url}.
 * The seq waiter (from the skill instructions):
 *
 *   S=<dir>/.vstack-bridge/<stem>.seq ; N=<the seq printed when you armed>
 *   until [ ! -f "<...>.url" ] || [ "$(cat "$S" 2>/dev/null)" != "$N" ]; do sleep 2; done
 *
 * Carry the printed seq forward from the previous wake — never re-read it when
 * re-arming, or a send that lands in between is swallowed.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

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

if (cmd !== 'serve') { console.error(`unknown command "${cmd}" — serve or patch`); process.exit(2) }

/* ── serve ── */
const TEMPLATE = arg('--template', null)
if (!TEMPLATE || !fs.existsSync(TEMPLATE)) { console.error('--template <page.html> is required and must exist'); process.exit(2) }
if (!fs.existsSync(DOC)) { console.error(`--json file not found: ${DOC} — write the document first`); process.exit(2) }
const PORT = Number(arg('--port', 0))
const IDLE = Number(arg('--idle-timeout', 90))
const NAME = arg('--name', path.basename(DOC, '.json'))

const BRIDGE_DIR = path.join(path.dirname(DOC), '.vstack-bridge')
const STEM = path.basename(DOC, '.json')
const SEQ_FILE = path.join(BRIDGE_DIR, STEM + '.seq')
const URL_FILE = path.join(BRIDGE_DIR, STEM + '.url')
fs.mkdirSync(BRIDGE_DIR, { recursive: true })
if (!fs.existsSync(SEQ_FILE)) fs.writeFileSync(SEQ_FILE, '0')

const TOKEN = crypto.randomBytes(16).toString('base64url')
const okToken = url => url.searchParams.get('t') === TOKEN
const okHeader = req => req.headers['x-vstack-token'] === TOKEN

let fromPage = null                      // hash of the page's last save — never echo it back
let lastHash = sha(fs.readFileSync(DOC, 'utf8'))
let lastMtime = fs.statSync(DOC).mtimeMs

const clients = new Set()
let everConnected = false
let idleSince = Date.now()

function page () {
  const body = fs.readFileSync(TEMPLATE, 'utf8')
  const handle = `<script>window.__VSTACK_BRIDGE__=${JSON.stringify({
    token: TOKEN, name: NAME, doc: '/doc', save: '/save', events: '/events',
  })}</script>\n`
  if (/^\s*<!doctype/i.test(body)) return body.replace(/(<head[^>]*>)/i, `$1\n${handle}`)
  return `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${handle}${body}`
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
      console.log(`save #${seq} from page (${body.length}b)`)
      return send(res, 200, 'application/json', JSON.stringify({ ok: true, seq }))
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
  const payload = 'event: push\ndata: ' + text.replace(/\n/g, '\ndata: ') + '\n\n'
  for (const c of clients) c.write(payload)
  console.log('pushed update to ' + clients.size + ' client(s)')
}, 1000)

/* keepalive — SSE clients are the only tab-alive signal we have */
setInterval(() => { for (const c of clients) c.write(': keepalive\n\n') }, 5000)

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

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?t=${TOKEN}`
  writeAtomic(URL_FILE, url)
  console.log(`${NAME} — live link up`)
  console.log(`  open ${url}`)
  console.log(`  seq  ${SEQ_FILE} (${fs.readFileSync(SEQ_FILE, 'utf8')})`)
})

#!/usr/bin/env node
/**
 * review-server.mjs — the local half of the wireframe review loop.
 *
 * Two things can go under review, and the loop around them is the same:
 *
 *   a file  — a wireframe, an exported screen, any self-contained HTML page.
 *             Served inside the workspace, with a version frozen on each publish.
 *   an app  — something already running on localhost. The server reverse-proxies
 *             it, so the reviewer drives the real UI inside the workspace and
 *             comments land on real elements, on the route they were made on.
 *
 * Either way the workspace shares an origin with what it is annotating — which
 * is the whole trick, because a comment is attached to an element, not to a
 * coordinate, and that needs to reach into the frame's document.
 *
 * Node >= 18, standard library only.
 *
 *   node review-server.mjs serve   --file <page.html> [--port 7788] [--idle-timeout 90]
 *   node review-server.mjs serve   --app <url> [--name <slug>] [--start /path] [--port 7788]
 *   node review-server.mjs claim   --file <page.html> --round r1
 *   node review-server.mjs publish --file <page.html> --round r1 --label "…" [--addressed c1,c3]
 *   node review-server.mjs reply   --file <page.html> --round r1 --comment <id> --text "…"
 *   node review-server.mjs cancelled --file <page.html> --round r1
 *   node review-server.mjs share   --file <page.html> --url <artifact-url>
 *   node review-server.mjs status  --file <page.html>
 *   node review-server.mjs check   --file <page.html>   (exit 2 = stop asked)
 *   node review-server.mjs watch   --file <page.html>   (blocks until there is something to do)
 *
 * Every command takes `--app <url>` or `--name <slug>` in place of `--file` when
 * the review is of a running app.
 *
 * State lives in a sibling directory, out of the way of the page:
 *   <dir>/.ui-review/<name>/            (live: <cwd>/.ui-review/<name>/)
 *     state.json            { name, version, app?, start? }
 *     versions/v<n>.html    frozen copy of each published version
 *                           (live: the DOM as it stood when a review was sent)
 *     versions/v<n>.meta.json  label, date, what it addressed
 *     reviews/v<n>/         annotations.json · feedback.json · feedback.md
 *     pending               sentinel written on send, watched by the agent
 *     rounds/r<n>.json       durable round membership and completion record
 *     cancel                sentinel written when the reviewer calls a round off
 *     approved              sentinel written on sign-off — the review is over
 *     share                 sentinel — they want a shareable public link
 *     url                   the live URL — present only while the server runs
 *     watching              heartbeat — an agent session is waiting on this review
 *
 * The server closes itself when the browser tab does: the workspace holds an
 * SSE connection, and once the last one goes away and none returns within the
 * grace period the server removes `url` and exits. That exit re-invokes the
 * agent and ends the waiter, so nothing is left listening.
 *
 * Host selection (contracts/host.md): --host <id> or VSTACK_HOST. Injects
 * window.__VSTACK_HOST__ so the workspace never hardcodes a product name.
 * Protocol details: contracts/review-loop.md.
 */

import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { checkForUpdate, withUpdate } from '../../../lib/update-check.mjs'
import { resolveHostId, loadHost, withHost, AGENT_ROLE } from '../../../lib/host.mjs'

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

/** Host profile for UI injection (serve). Other commands ignore it. */
let HOST_PROFILE = null
try { HOST_PROFILE = loadHost(resolveHostId(args)) } catch (e) {
  if (args._ === 'serve') { console.error(e.message); process.exit(2) }
}

/* ── what is under review: a file, or a running app ───────────────── */

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'

/** "localhost:5173" and ":5173" are what people actually type. */
function targetURL (raw) {
  let s = String(raw).trim()
  if (/^:\d+$/.test(s)) s = 'http://localhost' + s
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s
  let u
  try { u = new URL(s) } catch { console.error(`Not a URL: ${raw}`); process.exit(1) }
  if (!/^https?:$/.test(u.protocol)) { console.error(`Only http(s) targets: ${raw}`); process.exit(1) }
  return u
}

const APP = args.app ? targetURL(args.app) : null
/* A command run away from `serve` (publish, reply, status) only needs to find
   the store, and `--name` is enough for that. */
const LIVE = !!APP || (!args.file && !args.root && !!args.name && args.name !== true)

let FILE = null, DIR, NAME, STORE
if (LIVE) {
  NAME = slug(args.name && args.name !== true ? args.name : `${APP.hostname}-${APP.port || APP.protocol.replace(':', '')}`)
  DIR = process.cwd()
  // Live state has nothing to sit beside, so it sits in the project — which
  // means every command has to be run from the same place. `--store` is the way
  // out when it can't be.
  STORE = args.store && args.store !== true ? path.resolve(String(args.store)) : path.join(DIR, '.ui-review', NAME)
  if (APP && !/^(localhost|127\.0\.0\.1|\[::1\]|::1|0\.0\.0\.0)$/i.test(APP.hostname)) {
    console.error(`Note: ${APP.origin} is a public site, not a local dev server. Its own absolute links`)
    console.error('      are rewritten to stay inside the proxy, but bot protection, a login wall or a')
    console.error('      strict CSRF check can still refuse it. If the site misbehaves, say so.')
  }
} else if (args._ === 'watch' && (args.all === true || args.all === 'true')) {
  /* `watch --all` names no subject on purpose — it finds the live ones itself,
     so a session with several pages open arms one waiter instead of one each. */
  DIR = process.cwd(); NAME = 'all'; STORE = path.join(DIR, '.ui-review')
} else {
  if (!args.file && !args.root) {
    console.error('What is under review? Pass --file <page.html>, or --app <url> for a running app.')
    process.exit(1)
  }
  FILE = path.resolve(args.file || args.root || '')
  if (!fs.existsSync(FILE) || !fs.statSync(FILE).isFile()) {
    console.error(`Not a file: ${FILE}`)
    process.exit(1)
  }
  DIR = path.dirname(FILE)
  NAME = path.basename(FILE).replace(/\.html?$/i, '')
  STORE = path.join(DIR, '.ui-review', NAME)
}

/** Where the workspace lives when the app owns the root path space. */
const BASE = LIVE ? '/__review' : ''
/** How every other command names this same review. */
const SUBJECT = LIVE ? `--name "${NAME}"` : `--file "${FILE}"`

const P = {
  state: () => path.join(STORE, 'state.json'),
  versions: () => path.join(STORE, 'versions'),
  version: n => path.join(STORE, 'versions', `v${n}.html`),
  review: n => path.join(STORE, 'reviews', `v${n}`),
  rounds: () => path.join(STORE, 'rounds'),
  round: id => path.join(STORE, 'rounds', `${id}.json`),
  lock: () => path.join(STORE, 'transition.lock'),
  pending: () => path.join(STORE, 'pending'),
  cancel: () => path.join(STORE, 'cancel'),
  approved: () => path.join(STORE, 'approved'),
  share: () => path.join(STORE, 'share'),
  url: () => path.join(STORE, 'url'),
  /* Touched every couple of seconds by `watch`, deleted when it stops. A
     heartbeat rather than a flag, because the thing that waits can be killed
     without getting a chance to tidy up — and a stale marker claiming someone
     is listening is worse than no marker at all. */
  watching: () => path.join(STORE, 'watching'),
}
const WATCH_STALE_MS = 15000
const someoneWatching = () => {
  try { return Date.now() - fs.statSync(P.watching()).mtimeMs < WATCH_STALE_MS } catch { return false }
}

const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeJSON = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n')
  fs.renameSync(tmp, f)
}

let heldLock = null
const lockWait = new Int32Array(new SharedArrayBuffer(4))
function acquireStoreLock (timeout = 2500) {
  fs.mkdirSync(STORE, { recursive: true })
  const until = Date.now() + timeout
  while (true) {
    try {
      heldLock = fs.openSync(P.lock(), 'wx')
      fs.writeFileSync(heldLock, `${process.pid}\n`)
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      try {
        // A killed process cannot clean up. A transition never legitimately
        // holds this lock for thirty seconds, so recover that orphan safely.
        if (Date.now() - fs.statSync(P.lock()).mtimeMs > 30000) {
          fs.rmSync(P.lock(), { force: true })
          continue
        }
      } catch {}
      if (Date.now() >= until) throw new Error('review state is busy; retry the command')
      Atomics.wait(lockWait, 0, 0, 25)
    }
  }
}
function releaseStoreLock () {
  if (heldLock === null) return
  try { fs.closeSync(heldLock) } catch {}
  heldLock = null
  try { fs.rmSync(P.lock(), { force: true }) } catch {}
}
function withStoreLock (fn) {
  acquireStoreLock()
  try { return fn() } finally { releaseStoreLock() }
}
process.on('exit', releaseStoreLock)

/** The page names itself through its <title>; the filename is the fallback.
    A running app has no one title — it has a different one per route — so the
    name is what the reviewer called it, or the host it is on. */
function pageName () {
  if (LIVE) {
    if (args.name && args.name !== true) return String(args.name)
    return loadState().name || (APP ? APP.host : NAME)
  }
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(fs.readFileSync(FILE, 'utf8'))
  const t = m && m[1].trim()
  return t || NAME
}
/** The origin being proxied — from the flag, or from the store when a later
    command was run with just `--name`. */
const appOrigin = () => (APP ? APP.origin : loadState().app || null)
const loadState = () => readJSON(P.state(), { version: 0 })
const saveState = s => writeJSON(P.state(), s)

/** Review folders outlive snapshot history. Scan them directly so clearing old
 * versions cannot make carried comments impossible to reply to or close. */
function listReviewVersions () {
  let files = []
  try { files = fs.readdirSync(path.join(STORE, 'reviews')) } catch { return [] }
  return files.flatMap(file => {
    const match = /^v(\d+)$/.exec(file)
    return match ? [Number(match[1])] : []
  }).sort((a, b) => a - b)
}

function commentRecords (id) {
  return listReviewVersions().flatMap(version => {
    const file = path.join(P.review(version), 'annotations.json')
    const saved = readJSON(file)
    const comment = saved?.annotations?.find(a => a.id === id)
    return comment ? [{ version, file, saved, comment }] : []
  })
}

const latestComment = id => commentRecords(id).at(-1) || null

function latestComments () {
  const found = new Map()
  for (const version of listReviewVersions()) {
    const file = path.join(P.review(version), 'annotations.json')
    const saved = readJSON(file)
    for (const comment of saved?.annotations || []) found.set(comment.id, { version, file, saved, comment })
  }
  return [...found.values()]
}

/** A submitted comment revision is immutable for that round. Agent replies are
 * a disposition, so only open comments are compared against this fingerprint. */
function commentRevision (comment) {
  const value = {
    id: comment?.id || '',
    status: comment?.status || 'open',
    note: comment?.note || '',
    replies: (comment?.replies || []).map(reply => ({
      by: reply.by || '', text: reply.text || '', at: reply.at || '',
    })),
    reopened: !!(comment?.reopened ?? comment?.reopenedAt),
    wantsRevert: !!(comment?.wantsRevert ?? comment?.revert),
  }
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

function loadActiveRound (state = loadState()) {
  if (!state.activeRound) return null
  const round = readJSON(P.round(state.activeRound))
  return round && !['completed', 'cancelled', 'approved'].includes(round.status) ? round : null
}

function saveActiveRound (round) {
  writeJSON(P.round(round.id), round)
  const state = loadState()
  state.activeRound = round.id
  state.roundSeq = Math.max(Number(state.roundSeq) || 0, Number(String(round.id).replace(/^r/, '')) || 0)
  saveState(state)
  return round
}

function finishActiveRound (round, status, extra = {}) {
  if (!round) return
  const finished = { ...round, ...extra, status, finishedAt: new Date().toISOString() }
  writeJSON(P.round(round.id), finished)
  const state = loadState()
  if (state.activeRound === round.id) delete state.activeRound
  state.lastRound = { id: round.id, status, version: extra.publishedVersion || state.version }
  saveState(state)
  fs.rmSync(P.pending(), { force: true })
  return finished
}

function nextRound (version, comments, feedback) {
  const state = loadState()
  let round = loadActiveRound(state)
  if (!round) {
    const seq = (Number(state.roundSeq) || 0) + 1
    round = {
      id: `r${seq}`, baseVersion: version, status: 'queued',
      createdAt: new Date().toISOString(), comments: [],
    }
  }
  const members = new Map((round.comments || []).map(comment => [comment.id, comment]))
  for (const comment of comments || []) {
    members.set(comment.id, { id: comment.id, revision: commentRevision(comment) })
  }
  round.comments = [...members.values()]
  round.feedback = feedback
  round.updatedAt = new Date().toISOString()
  if (fs.existsSync(P.cancel())) round.status = 'queued'
  return saveActiveRound(round)
}

/** Upgrade an in-flight review created by a pre-round-ledger server. This keeps
 * a tool update or server restart from stranding feedback already on disk. */
function migrateLegacyPending () {
  const state = loadState()
  const existing = loadActiveRound(state)
  if (existing) return existing
  const pending = readJSON(P.pending())
  if (!pending?.comments?.length) return null
  const seq = (Number(state.roundSeq) || 0) + 1
  const round = {
    id: `r${seq}`,
    baseVersion: Number(pending.version) || state.version,
    status: 'queued',
    createdAt: pending.sentAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    feedback: pending.feedback || null,
    comments: pending.comments.map(id => ({
      id,
      revision: commentRevision(latestComment(id)?.comment || { id }),
    })),
    migrated: true,
  }
  saveActiveRound(round)
  writeJSON(P.pending(), { ...pending, roundId: round.id })
  return round
}

function roundSummary (round) {
  if (!round) return null
  return {
    id: round.id, status: round.status, baseVersion: round.baseVersion,
    comments: (round.comments || []).map(comment => comment.id),
    createdAt: round.createdAt, claimedAt: round.claimedAt || null,
  }
}

function unresolvedComments () {
  return latestComments()
    .map(record => record.comment)
    .filter(comment => !comment.dismissed && comment.status !== 'addressed' && String(comment.note || '').trim())
    .map(comment => ({ id: comment.id, note: comment.note, status: comment.status || 'open' }))
}

/* A published round is its meta file. The frozen html beside it is optional —
   a live round only has one once a review has been sent from it, and a round
   with no capture is still a round. */
function listVersions () {
  if (!fs.existsSync(P.versions())) return []
  const ns = new Set()
  for (const f of fs.readdirSync(P.versions())) {
    const m = /^v(\d+)\.(html|meta\.json)$/.exec(f)
    if (m) ns.add(Number(m[1]))
  }
  return [...ns].sort((a, b) => a - b).map(n => ({
    ...readJSON(path.join(P.versions(), `v${n}.meta.json`), { n, label: `Version ${n}` }),
    captured: fs.existsSync(P.version(n)),
  }))
}

/* ──────────────────────────── publish ───────────────────────────── */

/**
 * Freeze the working file as the NEXT version and make it current, so the
 * version the workspace names always has a frozen copy behind it.
 * --replace overwrites the current version instead (for a version nobody has
 * reviewed yet).
 */
function cmdPublish (quiet) {
  let state = loadState()
  const active = loadActiveRound(state) || migrateLegacyPending()
  const requestedRound = args.round && args.round !== true ? String(args.round) : null

  // Retrying a completed command is a no-op, not another version.
  if (!active && requestedRound) {
    const finished = readJSON(P.round(requestedRound))
    if (finished?.status === 'completed') {
      if (!quiet) console.log(`Round ${requestedRound} already published as v${finished.publishedVersion}`)
      return
    }
    console.error(`No active round ${requestedRound}`)
    process.exit(2)
  }

  const addressed = [...new Set(String(args.addressed || '').split(',').map(s => s.trim()).filter(Boolean))]
  if (active) {
    const errors = []
    if (!requestedRound) errors.push(`include --round ${active.id}`)
    else if (requestedRound !== active.id) errors.push(`active round is ${active.id}, not ${requestedRound}`)
    if (active.status !== 'active') errors.push(`claim ${active.id} before publishing it`)
    if (args.replace === true || args.replace === 'true') errors.push('--replace cannot complete an active review round')
    if (fs.existsSync(P.cancel())) errors.push('the reviewer asked to stop this round')

    const members = new Map((active.comments || []).map(comment => [comment.id, comment]))
    for (const id of addressed) if (!members.has(id)) errors.push(`${id} does not belong to ${active.id}`)
    for (const member of members.values()) {
      const found = latestComment(member.id)
      const comment = found?.comment
      if (!comment) { errors.push(`${member.id} no longer exists`); continue }
      if (comment.dismissed || comment.status === 'addressed' || comment.status === 'question') continue
      if (!addressed.includes(member.id)) {
        errors.push(`${member.id} is still open`)
        continue
      }
      if (commentRevision(comment) !== member.revision) {
        errors.push(`${member.id} changed after ${active.id} was submitted; collect the updated review before closing it`)
      }
    }
    for (const id of addressed) {
      const status = latestComment(id)?.comment?.status
      if (status && status !== 'open') errors.push(`${id} is ${status}, not open`)
    }
    if (errors.length) {
      console.error(`Cannot publish ${active.id}:`)
      for (const error of errors) console.error(`  - ${error}`)
      process.exit(2)
    }
  } else if (addressed.length) {
    console.error('Cannot mark comments addressed without an active review round')
    process.exit(2)
  } else if (fs.existsSync(P.cancel())) {
    console.error('Cannot publish: the reviewer asked to stop')
    process.exit(2)
  }

  // Validation is complete. Nothing above this line mutates a version or a
  // comment, so a rejected completion cannot leave a half-published round.
  const replace = args.replace === true || args.replace === 'true'
  const n = replace ? Math.max(1, state.version) : state.version + 1
  fs.mkdirSync(P.versions(), { recursive: true })
  if (!LIVE) fs.copyFileSync(FILE, P.version(n))

  // Feedback carries items forward, so patch every stored occurrence. Review
  // directories are the source here, not version history, which may be cleared.
  for (const id of addressed) {
    for (const record of commentRecords(id)) {
      if (record.comment.status !== 'open') continue
      record.comment.status = 'addressed'
      delete record.comment.reopenedAt
      delete record.comment.revert
      writeJSON(record.file, record.saved)
    }
  }

  const prev = readJSON(path.join(P.versions(), `v${n}.meta.json`), {}) || {}
  writeJSON(path.join(P.versions(), `v${n}.meta.json`), {
    n,
    label: args.label || prev.label || (n === 1 ? (LIVE ? 'The app as it stands' : 'Initial version') : `${LIVE ? 'Round' : 'Version'} ${n}`),
    date: new Date().toISOString(),
    addressed,
    ...(active ? { round: active.id } : {}),
  })

  state = loadState()
  state.version = n
  state.name = pageName()
  saveState(state)
  if (active) {
    const outcomes = Object.fromEntries((active.comments || []).map(member => {
      const comment = latestComment(member.id)?.comment
      return [member.id, addressed.includes(member.id) ? 'addressed'
        : comment?.status === 'question' ? 'waiting_for_reviewer'
          : comment?.dismissed ? 'dismissed' : comment?.status || 'unknown']
    }))
    finishActiveRound(active, 'completed', { publishedVersion: n, addressed, outcomes })
  }

  if (!quiet) console.log(`Published v${n}${active ? ` — completed ${active.id}` : ''}${addressed.length ? ` — ${addressed.length} item(s) marked addressed` : ''}`)
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
  const active = loadActiveRound() || migrateLegacyPending()
  const requestedRound = args.round && args.round !== true ? String(args.round) : null
  if (active) {
    if (!requestedRound || requestedRound !== active.id) {
      console.error(`Reply belongs to active round ${active.id}; include --round ${active.id}`)
      process.exit(2)
    }
    if (active.status !== 'active') {
      console.error(`Claim ${active.id} before replying to it`)
      process.exit(2)
    }
    if (!(active.comments || []).some(comment => comment.id === id)) {
      console.error(`${id} does not belong to ${active.id}`)
      process.exit(2)
    }
  }
  const record = latestComment(id)
  if (!record) { console.error(`No comment ${id} found`); process.exit(1) }
  const target = record.comment
  target.replies = (target.replies || []).concat({
    by: AGENT_ROLE, text, at: new Date().toISOString(),
  })
  if (args.status !== 'open') target.status = 'question'
  writeJSON(record.file, record.saved)

  // A round made entirely of questions/dismissals needs no empty publication.
  // Close its machine-owned work state as soon as no member remains open.
  if (active) {
    const outcomes = Object.fromEntries((active.comments || []).map(member => {
      const comment = latestComment(member.id)?.comment
      return [member.id, comment?.dismissed ? 'dismissed' : comment?.status || 'missing']
    }))
    if (Object.values(outcomes).every(outcome => ['question', 'addressed', 'dismissed'].includes(outcome))) {
      finishActiveRound(active, 'completed', { outcomes })
    }
  }
  console.log(`Replied to ${id} on v${record.version} — the reviewer will see it on the comment`)
  touch()
}

/** Atomically acknowledge delivery without deleting the durable round ledger. */
function cmdClaim () {
  const round = loadActiveRound() || migrateLegacyPending()
  if (!round) { console.error('No active review round to claim'); process.exit(2) }
  const requested = args.round && args.round !== true ? String(args.round) : null
  if (!requested || requested !== round.id) {
    if (!requested) console.error(`Include --round ${round.id}`)
    else console.error(`Active round is ${round.id}, not ${requested}`)
    process.exit(2)
  }
  round.status = 'active'
  round.claimedAt ||= new Date().toISOString()
  round.lastClaimedAt = new Date().toISOString()
  saveActiveRound(round)
  fs.rmSync(P.pending(), { force: true })
  console.log(`Claimed ${round.id} — ${(round.comments || []).length} comment(s) · ${round.feedback}`)
  touch()
}

/** Acknowledge that a requested stop was honored. Publish remains blocked until
 * this explicit transition closes the active round and clears the request. */
function cmdCancelled () {
  const request = readJSON(P.cancel())
  if (!request) { console.error('No cancel request to acknowledge'); process.exit(2) }
  const round = loadActiveRound()
  const requested = args.round && args.round !== true ? String(args.round) : null
  if (round && (!requested || requested !== round.id)) {
    if (!requested) console.error(`Include --round ${round.id}`)
    else console.error(`Active round is ${round.id}, not ${requested}`)
    process.exit(2)
  }
  if (round) finishActiveRound(round, 'cancelled', { reason: request.reason || null })
  fs.rmSync(P.pending(), { force: true })
  fs.rmSync(P.cancel(), { force: true })
  console.log(`Cancelled ${round?.id || 'the current review round'} — open comments were left open`)
  touch()
}

/**
 * Hand the published Artifact's URL back to the workspace. It appears under the
 * ▾ beside Send, tagged with the version it was published from — so a link that
 * has gone stale says so instead of quietly misleading whoever you sent it to.
 */
function cmdShare () {
  const url = args.url
  if (!url || url === true) {
    console.error('Need --url <artifact-url>')
    process.exit(1)
  }
  const state = loadState()
  state.shareUrl = String(url)
  state.shareVersion = Number(args.version) || state.version
  saveState(state)
  fs.rmSync(P.share(), { force: true })
  console.log(`Shareable link recorded for v${state.shareVersion} — it is now in the workspace`)
  touch()
}

/**
 * "Should I still be doing this?" — one cheap call, made between steps of a
 * round. Exit 2 means the reviewer pressed Stop while you were working.
 *
 * This is the whole mechanism behind Stop, and it only works if it is actually
 * called: nothing here can interrupt a turn that is already running, so a round
 * that never checks cannot be stopped until it ends.
 */
function cmdCheck () {
  const req = fs.existsSync(P.cancel()) ? readJSON(P.cancel(), {}) : null
  if (!req) {
    if (!args.quiet) console.log('carry on')
    process.exit(0)
  }
  console.log('STOP — the reviewer asked you to stop this round.')
  console.log(`  asked at   ${req.at || 'unknown'}`)
  if (req.comments?.length) console.log(`  in flight  ${req.comments.join(', ')}`)
  console.log(`  reason     ${req.reason || '(none given)'}`)
  console.log('\nStop where you are. Do not publish a half-applied version. Tell the')
  console.log('reviewer what you had already changed and what you left alone, then acknowledge it:')
  const round = loadActiveRound()
  console.log(`  node review-server.mjs cancelled ${SUBJECT}${round ? ` --round ${round.id}` : ''}`)
  process.exit(2)
}

/**
 * Wait for the reviewer, and say so on the page while waiting.
 *
 * This replaces the shell `until [ -f pending ] …` loop the skill used to
 * describe, and adds the half that was missing: a heartbeat, so the workspace
 * can tell the difference between "the page can reach its server" and "someone
 * is actually going to read what I send". Exits the moment there is something
 * to do, printing what it was and which review it came from.
 *
 * One waiter covers as many reviews as you have open — a session with a
 * wireframe and a story map up needs one of these, not one each:
 *
 *   node review-server.mjs watch --file <page.html>
 *   node review-server.mjs watch --file a.html --file b.html
 *   node review-server.mjs watch --all           (every live review under cwd)
 */
const storeFor = f => {
  const abs = path.resolve(f)
  return path.join(path.dirname(abs), '.ui-review', path.basename(abs).replace(/\.html?$/i, ''))
}
const inStore = (store, name) => path.join(store, name)

/** Every store with a server behind it — `url` exists only while one runs. */
function liveStores (from = process.cwd(), depth = 5) {
  const found = []
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'versions', 'reviews'])
  const walk = (dir, left) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (!e.isDirectory() || skip.has(e.name)) continue
      const here = path.join(dir, e.name)
      if (e.name === '.ui-review') {
        for (const sub of fs.readdirSync(here, { withFileTypes: true })) {
          if (sub.isDirectory() && fs.existsSync(path.join(here, sub.name, 'url'))) {
            found.push(path.join(here, sub.name))
          }
        }
        continue
      }
      if (left > 0) walk(here, left - 1)
    }
  }
  walk(from, depth)
  return found
}

/**
 * `watch --stream` — the same watch, as an event stream that never ends.
 *
 * The one-shot form below has to exit to be heard, because a finished shell
 * command is often the only thing that re-invokes an idle agent session. That
 * makes re-arming a step someone has to remember, and it gets forgotten. A
 * stream is how every other file watcher works — nodemon, tsc --watch, entr —
 * and the Host op `watch_stream` consumes exactly this shape: one line of
 * stdout is one event, and the process stays up. Nothing to re-arm, and the
 * presence heartbeat no longer flickers off after every round.
 *
 *   node review-server.mjs watch --all --stream
 */
async function cmdStream (stores, beatAll, stop, label, all) {
  const seen = new Map(stores.map(s => [s, { sent: null, flags: new Set(), replies: repliesIn(s) }]))
  const say = line => { process.stdout.write(line + '\n') }
  say(`WATCHING  ${stores.length} review(s): ${stores.map(label).join(', ')}`)

  while (true) {
    for (const store of [...stores]) {
      const at = n => inStore(store, n)
      const was = seen.get(store)

      if (!fs.existsSync(at('url'))) {
        say(`CLOSED    ${label(store)} · the tab went away`)
        fs.rmSync(at('watching'), { force: true })
        stores = stores.filter(x => x !== store)
        seen.delete(store)
        continue
      }

      // Each sentinel is announced once per appearance, not once per poll.
      for (const [file, what] of [['approved', 'APPROVED '], ['cancel', 'CANCELLED'], ['share', 'SHARE    ']]) {
        if (fs.existsSync(at(file))) {
          if (!was.flags.has(file)) { say(`${what} ${label(store)} · read ${at(file)}`); was.flags.add(file) }
        } else was.flags.delete(file)
      }

      const brief = readJSON(at('pending'))
      if (brief && brief.sentAt !== was.sent) {
        was.sent = brief.sentAt
        say(`REVIEW    ${label(store)} · ${brief.roundId || 'legacy round'} · ${brief.counts?.total ?? '?'} comment(s) · ${brief.feedback}`)
      }

      // A reply is the other thing that waits on the agent, and it writes no
      // sentinel — answering a question just lands in annotations.json.
      const now = repliesIn(store)
      for (const [key, cur] of now) {
        if ((was.replies.get(key)?.n || 0) >= cur.n) continue
        say(`REPLIED   ${label(store)} · ${key} · "${(cur.last || '').replace(/\s+/g, ' ').slice(0, 100)}"`)
      }
      was.replies = now
    }

    /* A review opened after this started should join it. Otherwise "one watcher
       for the session" only holds for the tools that happened to be up when it
       began, and the next one opened is unwatched — the same hole as forgetting
       to re-arm, arriving by a different route. */
    if (all) {
      for (const store of liveStores()) {
        if (seen.has(store)) continue
        stores.push(store)
        seen.set(store, { sent: null, flags: new Set(), replies: repliesIn(store) })
        say(`OPENED    ${label(store)} · now watching ${stores.length} review(s)`)
      }
    }

    // With --all, an empty set means "no tab open right now" — keep the
    // stream and the heartbeat path alive so a later serve can OPENED in.
    // Without --all, empty means the only subject closed: done.
    if (!stores.length) {
      if (!all) { stop(); say('CLOSED    nothing left to watch'); return process.exit(0) }
      // still waiting
    }
    beatAll()
    await new Promise(r => setTimeout(r, 1000))
  }
}

/** Every reviewer reply in a store, as `v<n>/<id>` → { n, last }. */
function repliesIn (store) {
  const out = new Map()
  let vs = []
  try { vs = fs.readdirSync(path.join(store, 'reviews')) } catch { return out }
  for (const v of vs) {
    for (const a of readJSON(path.join(store, 'reviews', v, 'annotations.json'))?.annotations || []) {
      const mine = (a.replies || []).filter(r => r.by === 'reviewer')
      if (mine.length) out.set(`${v}/${a.id}`, { n: mine.length, last: mine.at(-1)?.text || '' })
    }
  }
  return out
}

async function cmdWatch () {
  // `--file` may be given more than once; parseArgs keeps only the last, so
  // read them off the raw argv.
  const argv = process.argv.slice(2)
  const many = argv.flatMap((a, i) => a === '--file' && argv[i + 1] ? [argv[i + 1]] : [])
  // --all and --file combine: everything live in the project, plus anything
  // living outside it that you name.
  const all = args.all === true || args.all === 'true'
  let stores = [...(all ? liveStores() : []), ...many.map(storeFor)]
  // Named subjects only. Never fall back to the placeholder STORE from
  // `watch --all` (cwd/.ui-review) — that path is not a review store, and
  // treating it as one exits the stream the moment it sees no `url` file
  // (classic race: watcher armed before serve wrote its url).
  if (!stores.length && !all) stores = [STORE]
  stores = [...new Set(stores)]
  if (!stores.length && !(args.stream === true || args.stream === 'true')) {
    console.log('CLOSED — nothing to watch')
    return process.exit(0)
  }

  const label = store => path.basename(store)
  const beatAll = () => {
    for (const store of stores) {
      try { fs.mkdirSync(store, { recursive: true }); fs.writeFileSync(inStore(store, 'watching'), String(Date.now())) } catch {}
    }
  }
  const stop = () => {
    clearInterval(beat)
    for (const store of stores) fs.rmSync(inStore(store, 'watching'), { force: true })
  }
  const beat = setInterval(beatAll, 2000)
  process.on('SIGINT', () => { stop(); process.exit(130) })
  process.on('SIGTERM', () => { stop(); process.exit(143) })
  beatAll()
  touch()   // the page hears about it straight away

  if (args.stream === true || args.stream === 'true') {
    // Stream mode with --all and nothing live yet: wait for a serve to appear
    // instead of exiting. cmdStream's OPENED path picks new stores up.
    if (!stores.length && all) {
      process.stdout.write('WATCHING  0 review(s): waiting for a live serve…\n')
    }
    return cmdStream(stores, beatAll, stop, label, all)
  }

  console.log(`watching ${stores.length} review(s): ${stores.map(label).join(', ')}`)
  /* Exiting IS the wake-up — a running process cannot interrupt an idle agent
     session, so the only way to be called is to finish. That makes re-arming
     the easiest thing in the world to forget, and a forgotten waiter is a
     review nobody is reading. So the last thing printed is the command that
     puts it back. Prefer `watch --stream` via Host op watch_stream. */
  const rearm = `node "${process.argv[1]}" ${process.argv.slice(2).join(' ')}`
  const done = (what, store, file) => {
    stop()
    console.log(`${what}  ${label(store)}`)
    if (file) { try { console.log(fs.readFileSync(file, 'utf8')) } catch {} }
    console.log(`\nThis one-shot watch has now ended. Either restart it:\n  ${rearm}`)
    console.log(`or use the streaming form, which does not end:\n  ${rearm} --stream`)
    process.exit(0)
  }
  /* One review ending does not end the watch. A closed tab is reported and its
     review dropped; the others keep their heartbeat, because taking them all
     down over someone else's closure leaves every other page saying Unlinked
     until a human notices. The watch is over when there is nothing left. */
  while (stores.length) {
    for (const store of [...stores]) {
      const at = n => inStore(store, n)
      if (fs.existsSync(at('approved'))) return done('APPROVED', store, at('approved'))
      if (fs.existsSync(at('cancel')))   return done('CANCELLED', store, at('cancel'))
      if (fs.existsSync(at('share')))    return done('SHARE', store, at('share'))
      if (fs.existsSync(at('pending')))  return done('REVIEW', store, at('pending'))
      if (!fs.existsSync(at('url'))) {
        console.log(`CLOSED  ${label(store)} — the tab went away`)
        fs.rmSync(at('watching'), { force: true })
        stores = stores.filter(x => x !== store)
      }
    }
    if (!stores.length) break
    await new Promise(r => setTimeout(r, 1000))
  }
  stop()
  console.log('CLOSED — nothing left to watch. Nothing to re-arm.')
  process.exit(0)
}

function cmdStatus () {
  const state = loadState()
  console.log(JSON.stringify({
    reviewing: LIVE ? 'app' : 'file',
    file: FILE,
    app: appOrigin(),
    name: pageName(),
    version: state.version,
    versions: listVersions().map(v => `v${v.n}: ${v.label}`),
    activeRound: roundSummary(loadActiveRound(state)),
    pendingReview: fs.existsSync(P.pending()) ? readJSON(P.pending(), {}) : null,
    cancelRequest: fs.existsSync(P.cancel()) ? readJSON(P.cancel(), {}) : null,
    approved: fs.existsSync(P.approved()) ? readJSON(P.approved(), {}) : null,
    shareRequest: fs.existsSync(P.share()) ? readJSON(P.share(), {}) : null,
    shareUrl: loadState().shareUrl || null,
  }, null, 2))
}

/* ───────────────────────────── serve ────────────────────────────── */

const clients = new Set()
let reloadTimer = null
/* Only when it changes — a heartbeat file ticking every two seconds is not
   worth a message every two seconds. */
let lastPresence = null
setInterval(() => {
  const now = someoneWatching()
  if (now === lastPresence) return
  lastPresence = now
  const line = `event: presence\ndata: ${JSON.stringify({ watching: now })}\n\n`
  for (const c of clients) { try { c.write(line) } catch {} }
}, 3000).unref?.()
/* Set once the server is listening, so a request handler can end the review. */
let closeServer = null
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
  const activeRound = loadActiveRound(state)
  const reviews = {}
  for (const version of new Set([...listReviewVersions(), state.version])) {
    const saved = readJSON(path.join(P.review(version), 'annotations.json'))
    if (saved) reviews[version] = saved
  }
  return {
    mode: LIVE ? 'live' : 'local',
    name: pageName(),
    fileName: LIVE ? (APP ? APP.host : state.app || '') : path.basename(FILE),
    app: appOrigin(),
    base: BASE,
    startPath: state.start || '/',
    currentVersion: state.version,
    // A live review has no single document to hand over — the app serves it.
    html: LIVE ? '' : fs.readFileSync(FILE, 'utf8'),
    versions, reviews,
    shareUrl: state.shareUrl || null,
    shareVersion: state.shareVersion || null,
    sharePending: fs.existsSync(P.share()),
    historyClearedAt: state.historyClearedAt || null,
    /* Whether a round is out, and which comments are in it. The workspace used
       to know this only because it was the tab that pressed Send — so a reload,
       or a second tab, showed a review where nothing was happening. */
    pendingReview: fs.existsSync(P.pending()) ? readJSON(P.pending(), {}) : null,
    activeReview: roundSummary(activeRound),
    cancelRequest: fs.existsSync(P.cancel()) ? readJSON(P.cancel(), {}) : null,
    /* Whether an agent session is actually waiting on this review. The link dot
       used to say "Linked" whenever the page could reach this server, which is
       a fact about the browser and the file server — not about anyone being
       there to read what you send. */
    watching: someoneWatching(),
  }
}

/**
 * The workspace autosaves its whole list, so a reply written here between its
 * last fetch and its next save would be lost. The stored thread wins on length,
 * and a client can never un-address a comment by accident — only deliberately,
 * by hitting Revert or Refine, which stamps `reopenedAt`.
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
    if (prev.status === 'addressed' && a.status !== 'addressed' && !a.reopenedAt) merged.status = 'addressed'
    return merged
  })
}

/** Keep the current snapshot, but remove every earlier snapshot. Comments stay
 * in their review folders and can be cleared independently in the workspace.
 * The current version number deliberately stays put: published links
 * and any agent already holding that number must not silently point elsewhere. */
function clearHistory () {
  const current = loadState().version
  if (fs.existsSync(P.versions())) {
    for (const file of fs.readdirSync(P.versions())) {
      const match = /^v(\d+)\.(?:html|meta\.json)$/.exec(file)
      if (match && Number(match[1]) !== current) {
        fs.rmSync(path.join(P.versions(), file), { force: true })
      }
    }
  }
  const state = loadState()
  state.historyClearedAt = new Date().toISOString()
  saveState(state)
  return true
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

/* ────────────────────────── live: the proxy ──────────────────────────
   The workspace annotates by reaching into the frame's document, which the
   browser only allows same-origin. So the app is served *through* here: the
   workspace moves aside to /__review and everything else is passed to the real
   server, which leaves the app's own absolute paths (/assets/…, /api/…)
   working exactly as they do when you open it directly.

   Only two kinds of header are touched: the ones whose whole job is to stop a
   page being framed, and a redirect back to the app's own origin, which would
   otherwise take the reviewer out of the proxy mid-flow.

   A public site needs more than a dev server does. It writes its own origin into
   its markup in absolute form — one click on `https://site.com/pricing` and the
   frame is off the proxy, cross-origin, and every comment on it stops working
   silently. So text responses are rewritten to point back through here. That is
   the only edit made to the page; nothing else about it is touched. */
const STRIP = [
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  // Would teach the browser to force https on localhost, for every review after
  // this one.
  'strict-transport-security',
]
/** Bodies worth rewriting. Everything else streams through untouched — and an
    event stream must, or it would be buffered until the page gave up. */
const REWRITABLE = /^(text\/html|text\/css|text\/javascript|application\/(x-)?javascript|application\/json|application\/manifest\+json)/i
const upstream = () => (APP.protocol === 'https:' ? https : http)
const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/* The site's own origin, in every form it writes it: absolute, protocol-
   relative, and with the slashes escaped the way JSON encoders leave them. */
const ORIGIN_RE = new RegExp(`(https?:)?//${rx(APP ? APP.host : '')}/?`, 'g')
const ESCAPED_RE = new RegExp(`(https?:)?\\\\/\\\\/${rx(APP ? APP.host : '')}(\\\\/)?`, 'g')
const toLocal = body => body.replace(ORIGIN_RE, '/').replace(ESCAPED_RE, '\\/')

/* A service worker registered by the site would take over this whole origin —
   including the workspace — and outlive the review. Registration is refused for
   as long as the page is being reviewed; nothing else is changed. */
const NO_SW = '<script>try{if(navigator.serviceWorker)' +
  "navigator.serviceWorker.register=()=>Promise.reject(new Error('disabled during review'))}catch(e){}</script>"

function upstreamOpts (req) {
  const headers = { ...req.headers, host: APP.host }
  // The site has to see itself. A form post whose Origin says localhost is
  // exactly what a CSRF check exists to refuse.
  if (headers.origin) headers.origin = APP.origin
  if (headers.referer) headers.referer = String(headers.referer).replace(/^https?:\/\/[^/]+/, APP.origin)
  // Rewriting a body means reading it; ask for one that does not need inflating.
  headers['accept-encoding'] = 'identity'
  return {
    protocol: APP.protocol,
    hostname: APP.hostname,
    port: APP.port || (APP.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers,
    servername: APP.hostname,
    // A dev server on a self-signed cert is still the thing under review.
    rejectUnauthorized: false,
  }
}

/** Cookies are set for the site's domain; on this origin that makes them
    unsettable, which logs the reviewer out on every navigation. */
function localCookies (value) {
  return [].concat(value).map(c => String(c)
    .replace(/;\s*domain=[^;]*/ig, '')
    .replace(/;\s*partitioned/ig, ''))
}

/** Shown inside the frame when the app is not answering — the reviewer should
    learn that from the canvas, not from a blank white box. */
const downPage = e => `<!doctype html><meta charset="utf-8">
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;
font:14px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;color:#334;background:#fbfbfd}
div{max-width:30rem;padding:2rem;text-align:center}code{background:#eef;padding:.15em .4em;border-radius:4px}
h1{font-size:1rem;margin:0 0 .5rem}p{margin:.4rem 0;color:#667}</style>
<div><h1>Can't reach ${APP.origin}</h1>
<p>The review is still open — start the app and hit reload.</p>
<p><code>${String(e && e.code || e || '')}</code></p></div>`

function proxy (req, res) {
  const up = upstream().request(upstreamOpts(req), r => {
    const h = { ...r.headers }
    for (const k of STRIP) delete h[k]
    if (h['set-cookie']) h['set-cookie'] = localCookies(h['set-cookie'])
    if (h.location) h.location = String(h.location).replace(ORIGIN_RE, '/')
    const type = String(h['content-type'] || '')
    const rewrite = REWRITABLE.test(type) && !/event-stream/i.test(type)
    if (!rewrite) {
      res.writeHead(r.statusCode || 502, r.statusMessage, h)
      return r.pipe(res)
    }
    // Held whole, because a self-origin URL can straddle any chunk boundary.
    const chunks = []
    r.on('data', c => chunks.push(c))
    r.on('end', () => {
      let body = Buffer.concat(chunks)
      const enc = String(h['content-encoding'] || '').toLowerCase()
      try {
        if (enc === 'gzip') body = zlib.gunzipSync(body)
        else if (enc === 'deflate') body = zlib.inflateSync(body)
        else if (enc === 'br') body = zlib.brotliDecompressSync(body)
      } catch { /* not what it claimed to be — pass it through as it came */ }
      if (enc) delete h['content-encoding']
      let out = toLocal(body.toString('utf8'))
      if (/text\/html/i.test(type)) out = out.replace(/<head[^>]*>/i, m => m + NO_SW)
      const buf = Buffer.from(out)
      h['content-length'] = String(buf.length)
      res.writeHead(r.statusCode || 502, r.statusMessage, h)
      res.end(buf)
    })
    r.on('error', () => res.destroy())
  })
  up.on('error', e => {
    if (res.headersSent) return res.destroy()
    send(res, 502, downPage(e), MIME['.html'])
  })
  req.pipe(up)
}

/** HMR and any other socket the app opens. Without this a dev server reconnects
    forever in the console and the page stops updating on save. */
function proxyUpgrade (req, socket, head) {
  const up = upstream().request(upstreamOpts(req))
  up.on('upgrade', (r, us, uhead) => {
    const lines = [`HTTP/1.1 ${r.statusCode} ${r.statusMessage || 'Switching Protocols'}`]
    for (const [k, v] of Object.entries(r.headers)) {
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`)
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n')
    if (uhead?.length) socket.write(uhead)
    us.on('error', () => socket.destroy())
    socket.on('error', () => us.destroy())
    us.pipe(socket).pipe(us)
  })
  up.on('error', () => socket.destroy())
  if (head?.length) up.write(head)
  up.end()
}

/** The workspace, told where it is living. Everything else about it is static. */
function serveWorkspace (res) {
  let html = fs.readFileSync(path.join(HERE, 'workspace.html'), 'utf8')
  if (BASE) html = html.replace(/<head>/i, `<head>\n<script>window.VS_BASE=${JSON.stringify(BASE)}</script>`)
  html = withHost(html, HOST_PROFILE)
  send(res, 200, withUpdate(html, update), MIME['.html'])
}

async function handle (req, res) {
  const url = new URL(req.url, 'http://localhost')
  const raw = decodeURIComponent(url.pathname)
  // Live: the app owns the whole path space and the workspace lives under
  // BASE. Anything that is not ours belongs to the app.
  let p = raw
  if (LIVE) {
    if (raw !== BASE && !raw.startsWith(BASE + '/')) return proxy(req, res)
    p = raw.slice(BASE.length) || '/'
  }

  if (p === '/' || p === '/index.html') return serveWorkspace(res)
  if (p === '/page' && !LIVE) return serveStatic(res, FILE)
  if (p === '/api/project') {
    try { return sendJSON(res, 200, payload()) } catch (e) { return sendJSON(res, 500, { error: String(e) }) }
  }
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('retry: 1000\n\n')
    clients.add(res)
    everConnected = true
    idleSince = null
    // Presence rides the same stream: a waiter starting or stopping is news the
    // page needs, and it is the one change no file write announces.
    try { res.write(`event: presence\ndata: ${JSON.stringify({ watching: someoneWatching() })}\n\n`) } catch {}
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
    if (fs.existsSync(f)) return serveStatic(res, f)
    // A live round only has a capture if a review was sent from it. Say so in
    // the frame rather than showing a 404 where a screen should be.
    if (LIVE) {
      return send(res, 200, `<!doctype html><meta charset="utf-8">
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;
font:14px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;color:#667;background:#fbfbfd}</style>
<p>No capture of round ${Number(vm[1])} — nothing was sent for review from it.</p>`, MIME['.html'])
    }
    return send(res, 404, '')
  }
  /**
   * The DOM as it stood when the reviewer was looking at it. A live review has
   * no file to freeze, so the workspace hands one up: it is what the timeline
   * scrubs back to, and what gets published when they ask for a shareable link.
   */
  if (p === '/api/snapshot' && req.method === 'POST') {
    // File reviews freeze the file themselves; accepting a body here would let
    // a stray POST overwrite a published version.
    if (!LIVE) return sendJSON(res, 404, { error: 'not a live review' })
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    if (!body.html) return sendJSON(res, 400, { error: 'no html' })
    return withStoreLock(() => {
      fs.mkdirSync(P.versions(), { recursive: true })
      fs.writeFileSync(P.version(n), String(body.html))
      const meta = readJSON(path.join(P.versions(), `v${n}.meta.json`), { n }) || { n }
      writeJSON(path.join(P.versions(), `v${n}.meta.json`), {
        ...meta, n, capturedAt: new Date().toISOString(), route: body.route || '/',
      })
      return sendJSON(res, 200, { ok: true })
    })
  }
  if (p === '/api/annotations' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    return withStoreLock(() => {
      writeJSON(path.join(P.review(n), 'annotations.json'), {
        version: n, updatedAt: new Date().toISOString(),
        annotations: mergeIncoming(n, body.annotations || []),
      })
      return sendJSON(res, 200, { ok: true })
    })
  }
  if (p === '/api/history/clear' && req.method === 'POST') {
    return withStoreLock(() => {
      clearHistory()
      const data = payload()
      console.log(`\n⌫ Cleared versions before v${data.currentVersion}`)
      touch()
      return sendJSON(res, 200, {
        ok: true,
        currentVersion: data.currentVersion,
        versions: data.versions,
        historyClearedAt: data.historyClearedAt,
      })
    })
  }
  if (p === '/api/feedback' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    const dir = P.review(n)
    return withStoreLock(() => {
      /* Prepare the durable review material before raising its notification. The
         server's reload broadcast is debounced, so these synchronous writes are
         observed as one state transition rather than a transient empty round. */
      fs.mkdirSync(dir, { recursive: true })
      writeJSON(path.join(dir, 'annotations.json'), {
        version: n, updatedAt: new Date().toISOString(),
        annotations: mergeIncoming(n, body.annotations || []),
      })
      const round = nextRound(n, body.feedback?.comments || [], path.join(dir, 'feedback.md'))
      writeJSON(path.join(dir, 'feedback.json'), { ...(body.feedback || {}), roundId: round.id })
      fs.writeFileSync(path.join(dir, 'feedback.md'), String(body.markdown || '').replaceAll('<round-id>', round.id))
      const prev = fs.existsSync(P.pending()) ? readJSON(P.pending(), {}) : null
      const stillOut = prev?.roundId === round.id && prev?.sentAt && Date.now() - Date.parse(prev.sentAt) < 5 * 60e3
      writeJSON(P.pending(), {
        roundId: round.id,
        page: FILE || appOrigin(), app: appOrigin(),
        name: pageName(),
        version: n,
        counts: { total: round.comments.length },
        // Live: the screens the comments were made on, so the round can be
        // planned before the brief is even opened.
        routes: body.feedback?.routes || [],
        // Which comments went out, so a workspace opened later — or reloaded
        // mid-round — can put the progress back on the right ones instead of
        // showing a round that looks like it never happened.
        comments: round.comments.map(comment => comment.id),
        feedback: path.join(dir, 'feedback.md'),
        sentAt: stillOut ? prev.sentAt : new Date().toISOString(),
      })
      // A new review supersedes any earlier "stop" — they have moved on.
      fs.rmSync(P.cancel(), { force: true })
      console.log(`\n● ${round.id} sent for v${n} — ${round.comments.length} comment(s) → ${path.join(dir, 'feedback.md')}`)
      return sendJSON(res, 200, { ok: true, roundId: round.id })
    })
  }
  /**
   * The reviewer changed their mind while you were working. This is a request to
   * stop, not a hard kill — nothing here can reach into a running turn. The agent
   * notices it either through watch_stream or on its next check, and answers for
   * whatever it had already done.
   */
  /**
   * "Give me a link I can send to someone." The workspace cannot publish a
   * public URL — only the agent via Host op `share` can — so this raises the ask
   * and waits. The agent publishes and hands the URL back with `share --url`.
   */
  if (p === '/api/share' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    writeJSON(P.share(), { page: FILE || appOrigin(), app: appOrigin(), name: pageName(), version: n, at: new Date().toISOString() })
    console.log(`\n◆ Shareable link requested for v${n} — Host op share, then:`)
    console.log(`    node review-server.mjs share ${SUBJECT} --url <public-url>`)
    touch()
    return sendJSON(res, 200, { ok: true })
  }
  if (p === '/api/cancel' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    return withStoreLock(() => {
      writeJSON(P.cancel(), {
        page: FILE || appOrigin(), app: appOrigin(),
        name: pageName(),
        version: n,
        comments: body.comments || [],
        reason: body.reason || 'The reviewer cancelled this round.',
        at: new Date().toISOString(),
      })
      fs.rmSync(P.pending(), { force: true })
      console.log(`\n■ Cancel requested on v${n} — stop, then tell the reviewer what you had already changed`)
      touch()
      return sendJSON(res, 200, { ok: true })
    })
  }
  /**
   * Sign-off. The review is over: write the verdict and close the server, which
   * removes `url` and ends the waiter — so the same exit that means "tab closed"
   * now carries a reason, and the agent carries on with the design settled.
   */
  if (p === '/api/approve' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}')
    const n = Number(body.version) || loadState().version
    return withStoreLock(() => {
      const openComments = unresolvedComments()
      const expected = Number.isInteger(Number(body.expectedOpenCount))
        ? Number(body.expectedOpenCount)
        : Array.isArray(body.openComments) ? body.openComments.length : null
      if (expected !== null && expected !== openComments.length) {
        return sendJSON(res, 409, {
          error: 'The open-comment count changed. Review the current list before approving.',
          openComments,
        })
      }
      writeJSON(P.approved(), {
        page: FILE || appOrigin(), app: appOrigin(),
        name: pageName(),
        version: n,
        openComments,
        at: new Date().toISOString(),
      })
      const active = loadActiveRound()
      if (active) finishActiveRound(active, 'approved', {
        approvedVersion: n,
        outcomes: Object.fromEntries((active.comments || []).map(comment => [comment.id, 'left_open_on_approval'])),
      })
      fs.rmSync(P.pending(), { force: true })
      fs.rmSync(P.cancel(), { force: true })
      const left = openComments.length
      console.log(`\n✓ Approved at v${n}${left ? ` — ${left} comment(s) left unapplied` : ''} — the review is closed`)
      sendJSON(res, 200, { ok: true })
      // Let the response land before the socket goes away with the process.
      setTimeout(() => closeServer && closeServer('approved'), 350)
      return
    })
  }

  // Anything the page references (images, shared css) resolves beside it.
  // Live has no page dir — everything the app asks for went to the app.
  const f = LIVE ? null : safeJoin(DIR, p)
  if (f && fs.existsSync(f) && !fs.statSync(f).isDirectory()) return serveStatic(res, f)
  const asset = safeJoin(HERE, p)
  if (asset && fs.existsSync(asset) && !fs.statSync(asset).isDirectory()) return serveStatic(res, asset)
  return send(res, 404, 'Not found')
}

/* Filled in once, before the first page goes out — see lib/update-check.mjs for
   what it does and does not do. */
let update = null

async function cmdServe () {
  update = await checkForUpdate(HOST_PROFILE)
  if (HOST_PROFILE) console.log(`  host       ${HOST_PROFILE.id} (${HOST_PROFILE.name})`)
  // Serving an unpublished page would name a version with no frozen copy. The
  // same startup transaction upgrades feedback left by a pre-ledger server.
  withStoreLock(() => {
    if (loadState().version === 0) cmdPublish(true)
    migrateLegacyPending()
  })
  if (LIVE) {
    // Whoever picks this store up later — publish, reply, a second serve — needs
    // to know it is an app and which one, without being told again.
    const state = loadState()
    state.app = APP.origin
    state.name = pageName()
    if (args.start && args.start !== true) state.start = String(args.start).startsWith('/') ? args.start : '/' + args.start
    saveState(state)
  }
  // Terminal signals belong to the review that raised them. A new one starts
  // clean, or the first waiter it arms fires on last week's verdict. An active
  // round is recovery, not a new review: preserve its Stop request across a
  // server restart so publication cannot slip past it.
  fs.rmSync(P.approved(), { force: true })
  if (!loadActiveRound()) fs.rmSync(P.cancel(), { force: true })
  fs.rmSync(P.share(), { force: true })
  const port = Number(args.port || 7788)
  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => { try { sendJSON(res, 500, { error: String(e) }) } catch {} })
  })
  if (LIVE) server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith(BASE + '/') || req.url === BASE) return socket.destroy()
    proxyUpgrade(req, socket, head)
  })
  if (!LIVE) try { fs.watch(DIR, (_e, name) => { if (name === path.basename(FILE)) touch() }) } catch {}
  // Replies written by `reply` have to reach an open workspace too.
  try { fs.mkdirSync(path.join(STORE, 'reviews'), { recursive: true }) } catch {}
  try { fs.watch(path.join(STORE, 'reviews'), { recursive: true }, () => touch()) } catch {}
  /* `share --url` and `publish` run as their own process, so the touch() they
     call reaches no clients — this one is holding them. The store is the only
     thing both sides share, so watch the files that carry news: the state
     (version, share url), the sentinel that says a link is still wanted, and
     the brief — whose deletion is the agent collecting it, the moment the
     workspace starts holding new comments back instead of sending into the
     round. Without this the menu sits on "publishing the link…" forever and
     "queued" never becomes "being worked on". */
  try { fs.watch(STORE, (_e, name) => { if (name === 'state.json' || name === 'share' || name === 'pending') touch() }) } catch {}

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${port} is in use — a review server may already be running there.`)
      process.exit(2)
    }
    throw e
  })
  const url = `http://localhost:${port}${BASE}/`

  /* Dropping the url file tells the session's waiter the link is over, so it
     stops waiting instead of hanging until its timeout. */
  const close = why => {
    try { fs.rmSync(P.url(), { force: true }) } catch {}
    console.log(`closed (${why})`)
    process.exit(0)
  }
  closeServer = close

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

  /* A site that answers the front door with a redirect somewhere else — the www
     host, a country path, a login — is a review of the wrong origin: everything
     on the other side of it is outside the proxy. Better to say so at the start
     than to let the reviewer find out by watching comments stop working. */
  if (LIVE) {
    const probe = upstream().request({ ...upstreamOpts({ method: 'GET', url: '/', headers: {} }), timeout: 6000 }, r => {
      const loc = r.headers.location
      if (r.statusCode >= 300 && r.statusCode < 400 && loc) {
        let to
        try { to = new URL(loc, APP.origin) } catch { to = null }
        if (to && to.origin !== APP.origin) {
          console.log(`\n  ⚠ ${APP.origin} redirects to ${to.origin} — that origin is outside the proxy.`)
          console.log(`    Restart with --app ${to.origin} to review the page they actually land on.`)
        }
      }
      r.resume()
    })
    probe.on('error', () => {})
    probe.on('timeout', () => probe.destroy())
    probe.end()
  }

  server.listen(port, '127.0.0.1', () => {
    fs.mkdirSync(STORE, { recursive: true })
    fs.writeFileSync(P.url(), url + '\n')
    console.log(`${LIVE ? 'live review' : 'wireframe'} · ${pageName()} · v${loadState().version}`)
    console.log(`  workspace  ${url}`)
    console.log(LIVE ? `  app        ${APP.origin} (proxied)` : `  page       ${FILE}`)
    if (LIVE) console.log(`  store      ${STORE}`)
    console.log(idleTimeout > 0
      ? `  ready — closes itself ${idleTimeout}s after the tab does`
      : '  ready — stays up until stopped')
  })
}

switch (args._) {
  case 'publish': case 'snapshot': withStoreLock(() => cmdPublish()); break
  case 'claim': withStoreLock(cmdClaim); break
  case 'reply': withStoreLock(cmdReply); break
  case 'cancelled': withStoreLock(cmdCancelled); break
  case 'share': withStoreLock(cmdShare); break
  case 'status': cmdStatus(); break
  case 'check': cmdCheck(); break
  case 'watch': cmdWatch(); break
  case 'serve': cmdServe(); break
  default:
    console.error(`Unknown command "${args._}". Use: serve | claim | publish | reply | cancelled | share | status | check | watch`)
    process.exit(1)
}

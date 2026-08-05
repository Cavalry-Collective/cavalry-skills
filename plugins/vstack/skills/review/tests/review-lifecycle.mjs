#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER = path.resolve(HERE, '../assets/review-server.mjs')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vstack-round-test-'))
const page = path.join(temp, 'page.html')
const store = path.join(temp, '.vstack', 'local', 'review', 'page')
const port = 18000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`

const cli = (...argv) => spawnSync(process.execPath, [SERVER, ...argv, '--file', page], {
  encoding: 'utf8', cwd: temp,
})

async function request (pathname, options) {
  const response = await fetch(origin + pathname, options)
  const body = await response.json()
  return { response, body }
}

async function waitForServer () {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const result = await request('/api/project')
      if (result.response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('review server did not start')
}

async function startServer () {
  const child = spawn(process.execPath, [SERVER, 'serve', '--file', page, '--port', String(port), '--idle-timeout', '0', '--host', 'codex', '--no-open'], {
    cwd: temp, stdio: ['ignore', 'pipe', 'pipe'],
  })
  server = child
  await waitForServer()

  const workspace = await fetch(origin + '/')
  assert.equal(workspace.status, 200)
  assert.match(await workspace.text(), /window\.__VSTACK_HOST__=\{"id":"codex","name":"Codex"/)
}

const comment = (id, note, extra = {}) => ({
  id, kind: 'area', status: 'open', note, size: 'desktop', replies: [], ...extra,
})

async function sendRound (version, comments) {
  return request('/api/feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      version,
      annotations: comments,
      feedback: { comments: comments.map(item => ({ ...item })) },
      counts: { total: comments.length },
      markdown: '# Test review\n\n<round-id>\n',
    }),
  })
}

let server, awayServer
try {
  fs.writeFileSync(page, '<!doctype html><title>Round test</title><p>Initial</p>')
  assert.equal(cli('publish', '--label', 'Initial').status, 0)

  await startServer()

  const first = await sendRound(1, [comment('c1', 'First'), comment('c2', 'Second')])
  assert.equal(first.response.status, 200)
  assert.equal(first.body.roundId, 'r1')

  // "carry on" alone is how queued comments go unread: an unclaimed round is
  // named on every check, and the exit code still says continue.
  let result = cli('check')
  assert.equal(result.status, 0, 'check always carries on')
  assert.match(result.stdout, /r1 .* waiting unclaimed/)
  assert.match(result.stdout, /claim .*--round r1/)

  // A fresh watcher heartbeat with the round still young reads as linked …
  fs.writeFileSync(path.join(store, 'watching'), String(Date.now()))
  let project = await request('/api/project')
  assert.equal(project.body.watching, true)
  assert.equal(project.body.activeReview.stalled, false)

  // … but past the claim window the heartbeat no longer counts: a watcher
  // nobody reads and no watcher at all must look the same to the reviewer.
  const roundFile = path.join(store, 'rounds', 'r1.json')
  const backdated = JSON.parse(fs.readFileSync(roundFile))
  backdated.createdAt = new Date(Date.now() - 120_000).toISOString()
  fs.writeFileSync(roundFile, JSON.stringify(backdated))
  project = await request('/api/project')
  assert.equal(project.body.watching, false, 'a round unclaimed past the window must drop the linked state')
  assert.equal(project.body.activeReview.stalled, true)

  result = cli('publish', '--round', 'r1', '--label', 'Too soon', '--addressed', 'c1,c2')
  assert.equal(result.status, 2, 'an unclaimed round must not publish')
  assert.match(result.stderr, /claim r1/i)
  assert.equal(JSON.parse(fs.readFileSync(path.join(store, 'state.json'))).version, 1)

  assert.equal(cli('claim', '--round', 'r1').status, 0)
  project = await request('/api/project')
  assert.equal(project.body.watching, true, 'claiming the round restores the linked state')
  assert.match(cli('check').stdout, /^carry on\s*$/, 'a claimed round needs no warning')

  /* A stream watcher asks for the one thing only a live session can do, because
     nothing in the process can tell which tool started it. Presence begins when
     the handshake is answered; unanswered, the watcher exits saying so, which on
     hosts that re-invoke on exit delivers itself to whoever started it. */
  const watcher = (...extra) => {
    const child = spawn(process.execPath, [SERVER, 'watch', '--file', page, '--stream', ...extra], {
      cwd: temp, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', chunk => { out += chunk })
    return { child, read: () => out, ended: new Promise(resolve => child.once('exit', resolve)) }
  }
  fs.rmSync(path.join(store, 'watching'), { force: true })
  const ignored = watcher('--handshake-timeout', '2')
  assert.equal(await ignored.ended, 3, 'an unanswered watcher must exit non-zero')
  assert.match(ignored.read(), /HANDSHAKE/)
  assert.match(ignored.read(), /UNWIRED/)
  assert.equal(fs.existsSync(path.join(store, 'watching')), false,
    'a watcher nobody answered must never claim presence')

  const wired = watcher('--handshake-timeout', '30')
  for (let i = 0; i < 50 && !fs.existsSync(path.join(store, 'handshake')); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const token = JSON.parse(fs.readFileSync(path.join(store, 'handshake'), 'utf8')).token
  assert.equal(cli('ack', '--token', 'wrong').status, 2, 'a wrong token must not answer the handshake')
  assert.equal(cli('ack', '--token', token).status, 0)
  for (let i = 0; i < 50 && !fs.existsSync(path.join(store, 'watching')); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(fs.existsSync(path.join(store, 'watching')), 'an answered watcher starts beating')
  assert.match(wired.read(), /LINKED/)
  wired.child.kill('SIGTERM')
  await wired.ended
  assert.equal(cli('ack', '--token', token).status, 0, 'answering twice is not an error')

  /* Starting a second watcher overwrites the first one's handshake, so an
     answer names which one it is for. A watcher that read a missing handshake
     as its own answer would go live on someone else's — and keep beating after
     the answered one stopped, which is presence claiming exactly what it cannot
     see. */
  fs.rmSync(path.join(store, 'watching'), { force: true })
  const ignoredWatcher = watcher('--handshake-timeout', '4')
  for (let i = 0; i < 50 && !fs.existsSync(path.join(store, 'handshake')); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const firstToken = JSON.parse(fs.readFileSync(path.join(store, 'handshake'), 'utf8')).token
  const answeredWatcher = watcher('--handshake-timeout', '30')
  for (let i = 0; i < 50 && JSON.parse(fs.readFileSync(path.join(store, 'handshake'), 'utf8')).token === firstToken; i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const secondToken = JSON.parse(fs.readFileSync(path.join(store, 'handshake'), 'utf8')).token
  assert.notEqual(secondToken, firstToken, 'the second watcher asks in its own name')
  assert.equal(cli('ack', '--token', secondToken).status, 0)
  assert.equal(await ignoredWatcher.ended, 3, 'a watcher answered in another name must still time out')
  assert.match(ignoredWatcher.read(), /UNWIRED/)
  assert.doesNotMatch(ignoredWatcher.read(), /LINKED/, 'only the watcher that was answered may claim presence')
  assert.match(answeredWatcher.read(), /LINKED/)
  assert.ok(fs.existsSync(path.join(store, 'watching')),
    'the answered watcher keeps beating through the other one exiting')
  answeredWatcher.child.kill('SIGTERM')
  await answeredWatcher.ended

  /* A page an agent generates lands in a temp directory, and its store lands
     beside it — outside the directory the session runs `watch --all` from. The
     walk cannot reach it, so the serve leaves a pointer in the directory both
     processes do share, and the watcher heartbeats the review it names. Without
     that, the handshake is answered, the stream says Linked, and the workspace
     sits on Unlinked with nobody able to see why. */
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'vstack-away-test-'))
  const awayPage = path.join(away, 'elsewhere.html')
  const awayStore = path.join(away, '.vstack', 'local', 'review', 'elsewhere')
  fs.writeFileSync(awayPage, '<!doctype html><title>Elsewhere</title><p>Away</p>')
  awayServer = spawn(process.execPath, [SERVER, 'serve', '--file', awayPage,
    '--port', String(port + 1), '--idle-timeout', '0', '--no-open'], { cwd: temp, stdio: 'ignore' })
  for (let i = 0; i < 60 && !fs.existsSync(path.join(awayStore, 'url')); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(fs.existsSync(path.join(awayStore, 'url')), 'the second review must come up')

  const everywhere = spawn(process.execPath, [SERVER, 'watch', '--all', '--stream', '--handshake-timeout', '30'],
    { cwd: temp, stdio: ['ignore', 'pipe', 'pipe'] })
  let heard = ''
  everywhere.stdout.on('data', chunk => { heard += chunk })
  const allHandshake = path.join(temp, '.vstack', 'local', 'review', 'handshake')
  for (let i = 0; i < 50 && !fs.existsSync(allHandshake); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(spawnSync(process.execPath, [SERVER, 'ack', '--all',
    '--token', JSON.parse(fs.readFileSync(allHandshake, 'utf8')).token], { cwd: temp, encoding: 'utf8' }).status, 0)
  for (let i = 0; i < 50 && !fs.existsSync(path.join(awayStore, 'watching')); i++) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(fs.existsSync(path.join(awayStore, 'watching')),
    'a review outside the watcher\'s directory must still be heartbeaten')
  assert.match(heard, /LINKED/)
  everywhere.kill('SIGTERM')
  await new Promise(resolve => everywhere.once('exit', resolve))

  const pointer = path.join(temp, '.vstack', 'local', 'review', '.serving')
  assert.equal(fs.readdirSync(pointer).length, 2, 'each live serve points at its own store')
  awayServer.kill('SIGTERM')
  await new Promise(resolve => awayServer.once('exit', resolve))
  awayServer = null
  assert.equal(fs.readdirSync(pointer).length, 1, 'a serve that ends takes its pointer with it')
  fs.rmSync(away, { recursive: true, force: true })

  fs.writeFileSync(path.join(store, 'watching'), String(Date.now()))
  result = cli('publish', '--round', 'r1', '--label', 'Incomplete', '--addressed', 'c1')
  assert.equal(result.status, 2, 'an unresolved comment must block publication')
  assert.match(result.stderr, /c2 is still open/)

  result = cli('publish', '--round', 'r1', '--label', 'Unknown', '--addressed', 'c1,c2,c999')
  assert.equal(result.status, 2, 'unknown ids must block publication')
  assert.match(result.stderr, /c999 does not belong/)

  await request('/api/annotations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, annotations: [comment('c1', 'First, edited'), comment('c2', 'Second')] }),
  })
  result = cli('publish', '--round', 'r1', '--label', 'Stale', '--addressed', 'c1,c2')
  assert.equal(result.status, 2, 'a stale comment revision must block publication')
  assert.match(result.stderr, /changed after r1/)

  const refreshed = await sendRound(1, [comment('c1', 'First, edited'), comment('c2', 'Second')])
  assert.equal(refreshed.body.roundId, 'r1')
  assert.equal(cli('claim', '--round', 'r1').status, 0)
  assert.equal(cli('reply', '--round', 'r1', '--comment', 'c2', '--text', 'Could you clarify?').status, 0)
  assert.equal(cli('publish', '--round', 'r1', '--label', 'First addressed', '--addressed', 'c1').status, 0)

  let state = JSON.parse(fs.readFileSync(path.join(store, 'state.json')))
  assert.equal(state.version, 2)
  assert.equal(state.activeRound, undefined)
  const saved = JSON.parse(fs.readFileSync(path.join(store, 'reviews', 'v1', 'annotations.json')))
  assert.equal(saved.annotations.find(item => item.id === 'c1').status, 'addressed')
  assert.equal(saved.annotations.find(item => item.id === 'c2').status, 'question')

  assert.equal(cli('publish', '--round', 'r1', '--label', 'Retry', '--addressed', 'c1').status, 0)
  state = JSON.parse(fs.readFileSync(path.join(store, 'state.json')))
  assert.equal(state.version, 2, 'retrying a completed round must be idempotent')

  const cleared = await request('/api/history/clear', { method: 'POST' })
  assert.equal(cleared.response.status, 200)
  const afterClear = await request('/api/project')
  assert.deepEqual(afterClear.body.versions.map(version => version.n), [2])
  assert.equal(afterClear.body.reviews[1].annotations.find(item => item.id === 'c2').status, 'question',
    'clearing snapshots must not remove comment history')

  const second = await sendRound(2, [comment('c2', 'Second', {
    replies: [{ by: 'agent', text: 'Could you clarify?', at: '2026-01-01T00:00:00.000Z' },
      { by: 'reviewer', text: 'Yes, both.', at: '2026-01-01T00:01:00.000Z' }],
  })])
  assert.equal(second.body.roundId, 'r2')
  assert.equal(cli('claim', '--round', 'r2').status, 0)
  // A restart is recovery, not a new review: the claimed round has to survive it.
  server.kill('SIGTERM')
  await new Promise(resolve => server.once('exit', resolve))
  await startServer()
  const recovered = await request('/api/project')
  assert.equal(recovered.body.activeReview.id, 'r2', 'an active round must survive a restart')
  assert.equal(recovered.body.activeReview.status, 'active')

  let approval = await request('/api/approve', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 2, expectedOpenCount: 0 }),
  })
  assert.equal(approval.response.status, 409, 'approval must reject a stale client count')
  assert.equal(approval.body.openComments.length, 1)

  approval = await request('/api/approve', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 2, expectedOpenCount: 1 }),
  })
  assert.equal(approval.response.status, 200)
  const approved = JSON.parse(fs.readFileSync(path.join(store, 'approved')))
  assert.deepEqual(approved.openComments.map(item => item.id), ['c2'])

  const annotationsIn = version =>
    JSON.parse(fs.readFileSync(path.join(store, 'reviews', `v${version}`, 'annotations.json'))).annotations

  // A save reports what one client holds, which is never the whole review: a
  // comment carried from an earlier version is not in the payload at all. An id
  // the client left out must survive the save that omitted it.
  const save = annotations => request('/api/annotations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 2, annotations }),
  })
  await save([comment('c3', 'Third'), comment('c4', 'Fourth')])
  await save([comment('c3', 'Third, edited')])
  assert.deepEqual(annotationsIn(2).map(item => item.id).sort(), ['c2', 'c3', 'c4'],
    'a save must not delete the comments it did not mention')
  assert.equal(annotationsIn(2).find(item => item.id === 'c3').note, 'Third, edited',
    'a save must still update the comments it did mention')

  // c1 was addressed back on v1 and has not been touched since, so it lives
  // only in that older review file. The reply belongs where the workspace is
  // looking — the current version — not where the comment happens to sit.
  const replied = cli('reply', '--comment', 'c1', '--text', 'Which heading did you mean?')
  assert.equal(replied.status, 0)
  assert.match(replied.stdout, /on v2 \(carried forward from v1\)/)
  const answered = annotationsIn(2).find(item => item.id === 'c1')
  assert.ok(answered, 'a reply must land in the version the workspace has open')
  assert.equal(answered.replies.at(-1).text, 'Which heading did you mean?')
  assert.equal(answered.status, 'question')
  assert.deepEqual(annotationsIn(1).find(item => item.id === 'c1').replies, [],
    'the stale copy must not be the one that changed')

  assert.equal(cli('reply', '--comment', 'c404', '--text', 'Nobody home').status, 1,
    'a comment in no version at all must fail loudly')


  console.log('review lifecycle integration: ok')
} finally {
  server?.kill('SIGTERM')
  awayServer?.kill('SIGTERM')
  fs.rmSync(temp, { recursive: true, force: true })
}

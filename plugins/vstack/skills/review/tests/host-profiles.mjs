#!/usr/bin/env node

import assert from 'node:assert/strict'

import {
  listHosts,
  loadHost,
  resolveHostId,
  withHost,
} from '../../../lib/host.mjs'

assert.deepEqual(listHosts(), ['claude', 'codex', 'grok'])

const codex = loadHost('CODEX')
assert.equal(codex.id, 'codex')
assert.equal(codex.name, 'Codex')
assert.deepEqual(codex.capabilities, {
  share: 'copy',
  watch: 'stream',
  browser: true,
  updateDetect: 'none',
})
assert.equal(resolveHostId({ host: ' CODEX ' }), 'codex')

const html = withHost('<!doctype html><html><head><title>Host test</title></head></html>', codex)
assert.match(html, /window\.__VSTACK_HOST__=/)
assert.match(html, /"id":"codex"/)
assert.match(html, /"name":"Codex"/)

/* Every profile conforms to contracts/host.schema.json. loadHost checks only
   the top-level keys, so the schema's shape is enforced here — nowhere else
   validates it, and an off-enum value would otherwise fail silently at
   runtime (update-check gates on "none" alone). */
for (const id of listHosts()) {
  const p = loadHost(id)
  const where = `host-profiles/${id}.json`
  assert.deepEqual(Object.keys(p).filter(k => !['id', 'name', 'capabilities', 'install'].includes(k)), [],
    `${where}: unknown top-level keys`)
  assert.match(p.id, /^[a-z][a-z0-9-]*$/, `${where}: id pattern`)
  assert.equal(p.id, id, `${where}: id matches filename`)
  assert.ok(p.name.length >= 1, `${where}: name`)
  const c = p.capabilities
  assert.deepEqual(Object.keys(c).sort(), ['browser', 'share', 'updateDetect', 'watch'],
    `${where}: capabilities keys`)
  assert.ok(['artifact', 'copy', 'none'].includes(c.share), `${where}: share enum`)
  assert.ok(['stream', 'oneshot'].includes(c.watch), `${where}: watch enum`)
  assert.equal(typeof c.browser, 'boolean', `${where}: browser`)
  assert.ok(['claude-install', 'none'].includes(c.updateDetect), `${where}: updateDetect enum`)
  if (p.install) {
    assert.deepEqual(Object.keys(p.install).filter(k => !['howLead', 'commands', 'auto'].includes(k)), [],
      `${where}: unknown install keys`)
    assert.ok((p.install.commands || []).every(x => typeof x === 'string'), `${where}: install.commands`)
  }
}

console.log('host profiles: ok')

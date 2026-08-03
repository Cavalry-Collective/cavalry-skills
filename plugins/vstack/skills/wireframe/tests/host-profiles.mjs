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

console.log('host profiles: ok')

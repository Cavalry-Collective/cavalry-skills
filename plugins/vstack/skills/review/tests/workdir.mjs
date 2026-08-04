#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { workDir, findWorkDir, vstackRoot, LOCAL, TOOL } from '../../../lib/workdir.mjs'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vstack-workdir-test-'))

try {
  // A plain directory gets the .vstack beside it.
  assert.equal(
    workDir(path.join(temp, 'design'), TOOL.wireframe),
    path.join(temp, 'design', '.vstack', LOCAL, 'wireframe'),
    'state sits beside the artifact',
  )

  // An artifact already under a .vstack uses that one, at any depth, rather
  // than nesting .vstack/specs/.vstack/ beneath it.
  assert.equal(
    workDir(path.join(temp, '.vstack', 'specs'), TOOL.spec),
    path.join(temp, '.vstack', LOCAL, 'spec'),
    'an enclosing .vstack wins over nesting a second one',
  )
  assert.equal(
    vstackRoot(path.join(temp, '.vstack', 'build', 'deep', 'deeper')),
    path.join(temp, '.vstack'),
    'the enclosing .vstack is found from any depth',
  )

  // The tool name is the last segment, so nothing lands next to the tracked
  // pipeline files.
  for (const tool of Object.values(TOOL)) {
    const dir = workDir(temp, tool)
    assert.equal(path.basename(dir), tool)
    assert.equal(path.basename(path.dirname(dir)), LOCAL,
      `${tool} must sit under ${LOCAL}/, not at the top of .vstack/`)
  }
  assert.notEqual(TOOL.spec, 'specs', 'the spec tool dir must not shadow the tracked specs/ dir')

  // findWorkDir: a reader told the wrong tool still finds the writer's files,
  // so a skill that passes --tool to serve but not to watch does not hang.
  const written = workDir(temp, TOOL.spec)
  fs.mkdirSync(written, { recursive: true })
  fs.writeFileSync(path.join(written, 'feature.seq'), '3')

  assert.equal(findWorkDir(temp, TOOL.spec, 'feature.seq'), written, 'its own directory when it matches')
  assert.equal(findWorkDir(temp, TOOL.documents, 'feature.seq'), written, 'falls back across sibling tools')
  assert.equal(findWorkDir(temp, TOOL.documents, 'absent.seq'), workDir(temp, TOOL.documents),
    'with nothing to find, the caller keeps its own directory')

  console.log('workdir resolution: ok')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

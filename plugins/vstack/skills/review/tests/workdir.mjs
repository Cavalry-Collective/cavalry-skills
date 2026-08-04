#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { workDir, findWorkDir, subjectDir, vstackRoot, LOCAL, TOOL, LEGACY } from '../../../lib/workdir.mjs'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vstack-workdir-test-'))

try {
  // A plain directory gets the .vstack beside it.
  assert.equal(
    workDir(path.join(temp, 'design'), TOOL.review),
    path.join(temp, 'design', '.vstack', LOCAL, 'review'),
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

  // subjectDir: a fresh subject is created under the tool's current name, and a
  // subject written before a rename is read where it lies rather than stranded.
  assert.equal(
    subjectDir(temp, TOOL.review, 'login'),
    path.join(temp, '.vstack', LOCAL, 'review', 'login'),
    'a subject that exists nowhere yet lands under the current name',
  )

  const was = path.join(temp, '.vstack', LOCAL, LEGACY[TOOL.review][0], 'checkout')
  fs.mkdirSync(was, { recursive: true })
  assert.equal(subjectDir(temp, TOOL.review, 'checkout'), was,
    'a subject under the old tool directory is still found there')

  // Both present is the state a rename leaves behind. The current name wins, so
  // a review opened after the rename is never read out of the old directory.
  const now = path.join(temp, '.vstack', LOCAL, TOOL.review, 'checkout')
  fs.mkdirSync(now, { recursive: true })
  assert.equal(subjectDir(temp, TOOL.review, 'checkout'), now,
    'the current tool directory wins when a subject is in both')

  console.log('workdir resolution: ok')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

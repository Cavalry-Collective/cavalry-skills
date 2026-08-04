/**
 * host.mjs — load a Host profile (contracts/host.md).
 *
 * Profiles live in plugins/vstack/hosts/<id>.json. Servers inject the profile
 * into pages as window.__VSTACK_HOST__. Skills never hardcode product names
 * in the engine; they pass --host / VSTACK_HOST and read the adapter markdown.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectHead } from './live-link.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOSTS_DIR = path.join(HERE, '..', 'hosts')

const DEFAULT_ID = 'claude'

export function resolveHostId (args = {}) {
  const fromArg = args.host && args.host !== true ? String(args.host) : null
  const fromEnv = process.env.VSTACK_HOST || null
  return (fromArg || fromEnv || DEFAULT_ID).toLowerCase().trim()
}

export function loadHost (id = DEFAULT_ID) {
  const key = String(id || DEFAULT_ID).toLowerCase().trim()
  const file = path.join(HOSTS_DIR, `${key}.json`)
  if (!fs.existsSync(file)) {
    const known = listHosts().join(', ')
    throw new Error(`Unknown host "${key}". Known: ${known || '(none)'}`)
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!raw.id || !raw.name || !raw.capabilities) {
    throw new Error(`Host profile ${file} is missing id, name, or capabilities`)
  }
  return raw
}

export function listHosts () {
  try {
    return fs.readdirSync(HOSTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

/** Put the host handle into HTML the same way withUpdate does for updates. */
export function withHost (html, profile) {
  if (!profile) return html
  return injectHead(html, `<script>window.__VSTACK_HOST__=${JSON.stringify(profile)}</script>\n`)
}

/* Thread roles. Writers use these; readers additionally accept legacy "claude"
   where "agent" is meant — the self-contained pages carry that tolerance
   themselves, since they cannot import this file. */
export const AGENT_ROLE = 'agent'
export const REVIEWER_ROLE = 'reviewer'

/*
 * update-check.mjs — "is there a newer Visual Stack than the one you are using?"
 *
 * The pages are self-contained and the servers are local, so nothing here can
 * be answered from inside the browser: an Artifact runs under a CSP that blocks
 * every external request, and a served page has no business reaching GitHub on
 * its own. The server asks instead, once, and hands the answer to the page it
 * serves — `window.__VSTACK_UPDATE__`, which the shell turns into one
 * dismissable line under the bar.
 *
 * WHAT COUNTS AS NEWER
 * This plugin ships without a `version` in plugin.json, which is Claude Code's
 * way of saying "every commit is a release": it then keys its own update
 * decision on the git commit the plugin was installed from, and records that in
 * ~/.claude/plugins/installed_plugins.json. So this asks the same question the
 * same way — the SHA behind the installed copy, against the head of the default
 * branch. Should a `version` ever come back, it wins, because that is what
 * Claude Code would key on instead.
 *
 * A working copy is not an install. Running from a clone (developing the plugin
 * itself) finds no entry, and the check returns nothing rather than telling you
 * your own uncommitted branch is out of date.
 *
 * What it does, exactly, so nothing here is a surprise:
 *   - one GET of a public GitHub endpoint, per server start, 2.5s timeout
 *   - the answer cached for six hours
 *   - fails silent: no network, a rate limit, a bad parse — the page is served
 *     exactly as it would have been, with no banner and no error
 *
 * Nothing is sent: no identifiers, no telemetry, no query. Set
 * VSTACK_NO_UPDATE_CHECK=1 to skip it entirely.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { injectHead } from './live-link.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST = path.join(HERE, '..', '.claude-plugin', 'plugin.json')
const REPO = 'Cavalry-Collective/visual-stack'
const BRANCH = 'main'
const MARKET = 'cavalry-collective'   // .claude-plugin/marketplace.json → name
const PLUGIN = 'vstack'               // the marketplace entry's name
const INSTALLS = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
const CACHE = path.join(os.tmpdir(), 'vstack-update-check.json')
const TTL_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 2500

const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const short = sha => String(sha || '').slice(0, 7)

/** Whatever plugin.json still declares — normally nothing, by design. */
const manifestVersion = () => readJSON(MANIFEST)?.version || null

/**
 * The installed copy this file belongs to, as Claude Code recorded it: the
 * entry whose installPath contains us. Null when running from a clone.
 */
function installedCopy () {
  const all = readJSON(INSTALLS)?.plugins
  if (!all) return null
  for (const [id, entries] of Object.entries(all)) {
    for (const e of entries || []) {
      const root = e.installPath && path.resolve(e.installPath)
      if (root && (HERE === root || HERE.startsWith(root + path.sep))) {
        return { id, sha: e.gitCommitSha || null, version: e.version || null }
      }
    }
  }
  return null
}

/** 4.10.0 is newer than 4.9.3 — compare numbers, not strings. */
function isNewer (a, b) {
  const parts = v => String(v).split('-')[0].split('.').map(n => parseInt(n, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  }
  return false
}

/** One cache for both questions, so a server start costs at most one request. */
async function ask (kind) {
  const cached = readJSON(CACHE)
  if (cached?.at && cached.kind === kind && Date.now() - cached.at < TTL_MS) return cached.value ?? null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    let value = null
    if (kind === 'sha') {
      /* The commit feed rather than the REST API: api.github.com allows 60
         unauthenticated requests an hour per IP, which an office or a VPN
         burns through without anyone noticing, and this would then be a
         feature that quietly never fires. The feed is public, CDN-served and
         answers the one thing needed — the id of the newest commit. */
      const res = await fetch(`https://github.com/${REPO}/commits/${BRANCH}.atom`,
        { signal: ctl.signal, headers: { accept: 'application/atom+xml' } })
      if (!res.ok) throw new Error(String(res.status))
      value = /Commit\/([0-9a-f]{40})/.exec(await res.text())?.[1] || null
    } else {
      const res = await fetch(
        `https://raw.githubusercontent.com/${REPO}/${BRANCH}/plugins/${PLUGIN}/.claude-plugin/plugin.json`,
        { signal: ctl.signal, headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(String(res.status))
      value = (await res.json())?.version || null
    }
    // Cache the answer either way: a repo that has not moved should not be
    // asked again every time a server starts. Merged rather than replaced —
    // `met` is a different question and outlives any one answer.
    try {
      fs.writeFileSync(CACHE, JSON.stringify({ ...(readJSON(CACHE) || {}), at: Date.now(), kind, value }))
    } catch {}
    return value
  } catch {
    return cached?.kind === kind ? cached.value ?? null : null
  } finally {
    clearTimeout(timer)
  }
}

/** The words for the banner. The sentence says the same thing whichever
    question was asked — which release it is belongs in `key`, not in the words,
    because the reader can't act on a sha and doesn't want to read one. `key` is
    what dismissal is remembered against, so saying "not now" to one release
    still leaves the next one free to ask. */
const say = (key, title) => ({ pill: 'update', key, title })

/**
 * True the first time this machine hears about a release, and false after.
 * Opening a page is the start of a piece of work and a plugin update is not
 * what that moment is for, so the run that learns of a release keeps it to
 * itself and the next one says so.
 *
 * It is remembered here rather than in the page because the page cannot: a
 * server on an ephemeral port is a new origin every run, so its localStorage
 * starts empty every time and a first sighting would be all there ever was.
 */
function firstSighting (key) {
  const cache = readJSON(CACHE) || {}
  if (cache.met === key) return false
  try { fs.writeFileSync(CACHE, JSON.stringify({ ...cache, met: key })) } catch {}
  return true
}

/**
 * "Not now" for this release, remembered here as well as in the page. The page
 * remembers in localStorage, which is scoped to an origin — and a server on an
 * ephemeral port is a different origin every run, so a dismissal made there
 * would be forgotten by the next one and the same banner would return for good.
 *
 * @param {string} key The release the reader dismissed. Servers pass on only
 *   the key they offered, so a page cannot silence a release nobody has seen.
 */
export function dismissUpdate (key) {
  if (!key) return
  const cache = readJSON(CACHE) || {}
  try { fs.writeFileSync(CACHE, JSON.stringify({ ...cache, seen: String(key) })) } catch {}
}

/**
 * `{ pill, key, title, install, howLead, auto }` when there is something newer,
 * otherwise null. Never throws, never blocks longer than the timeout.
 *
 * @param {object} [hostProfile] Host profile (contracts/host.md). When
 *   capabilities.updateDetect is "none", returns null. install/howLead/auto
 *   come from the profile when present so banners stay host-agnostic.
 */
export async function checkForUpdate (hostProfile = null) {
  if (process.env.VSTACK_NO_UPDATE_CHECK) return null
  if (hostProfile?.capabilities?.updateDetect === 'none') return null

  const installed = installedCopy()
  if (!installed) return null            // a clone is not an install

  let words = null
  const version = manifestVersion()
  if (version && installed.version) {
    const latest = await ask('version')
    if (latest && isNewer(latest, installed.version)) {
      words = say(latest, 'A new version is available.')
    }
  } else if (installed.sha) {
    const latest = await ask('sha')
    if (latest && latest !== installed.sha) {
      words = say(short(latest), 'A new version is available.')
    }
  }
  if (!words) return null
  if ((readJSON(CACHE) || {}).seen === words.key) return null   // asked once, answered
  if (firstSighting(words.key)) return null

  const install = hostProfile?.install?.commands?.length
    ? hostProfile.install.commands
    : [
        `/plugin marketplace update ${MARKET}`,
        `/plugin update ${PLUGIN}@${MARKET}`,
        '/reload-plugins',
      ]
  const howLead = hostProfile?.install?.howLead
    || 'Run these in Claude Code:'
  const auto = hostProfile?.install && 'auto' in hostProfile.install
    ? hostProfile.install.auto
    : `Or turn on auto-update: /plugin → Marketplaces → ${MARKET}`

  return {
    ...words,
    howLead,
    install,
    auto: auto || null,
  }
}

/** Put the handle into a served page. No-op when there is nothing to say, so
    callers can apply it unconditionally. */
export function withUpdate (html, info) {
  if (!info) return html
  return injectHead(html, `<script>window.__VSTACK_UPDATE__=${JSON.stringify(info)}</script>\n`)
}

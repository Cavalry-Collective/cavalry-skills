#!/usr/bin/env node
/*
 * chooser-server.mjs — serve the stack & add-on chooser, take one answer, exit.
 *
 * Deliberately NOT the wireframe / story-map live link. Those keep a session
 * open for rounds of edits; this asks one question once. One POST and it is
 * done, which is why it owns ~150 lines instead of sharing 300 it would only
 * use a third of.
 *
 *   node chooser-server.mjs --repo <project dir> [--port 7799] [--out <file>]
 *
 * It reads `stacks/` and `add-ons/` from --repo, so the page always offers what
 * the template actually ships — a pack added upstream shows up with no edit
 * here. Blurbs come from each directory's README; the table below supplies the
 * short title and tags for the ones we know, and anything unknown still renders
 * from its README alone.
 *
 * On send it writes the choice as JSON to --out (default <repo>/.vstack/choice.json)
 * and exits 0. Ctrl-C, or closing the tab without choosing, exits 1.
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }

const REPO = path.resolve(arg('--repo', process.cwd()))
const PORT = Number(arg('--port', 7799))
const OUT  = path.resolve(arg('--out', path.join(REPO, '.cavalry', 'choice.json')))

if (!fs.existsSync(path.join(REPO, 'stacks')) || !fs.existsSync(path.join(REPO, 'add-ons'))) {
  console.error(`not a template-derived repo: ${REPO}\n  expected stacks/ and add-ons/ — clone cavalry-template-spa first`)
  process.exit(2)
}

/* Short titles and tags for what the template ships today. A directory missing
   from here is not an error — it renders from its README with no tags. */
const KNOWN = {
  'vercel':                     { title:'Vercel SPA',     tags:['React','SPA','Vercel','Neon'] },
  'vercel-ssr':                 { title:'Vercel SSR',     tags:['Next.js','SSR','Vercel','Neon'] },
  'nextjs-nestjs-postgres':     { title:'Next + NestJS',  tags:['Next.js','NestJS','Postgres','Prisma'] },
  'taro-fastify-mysql-tencent': { title:'Taro / Tencent', tags:['Taro','WeChat','Fastify','MySQL','Tencent'] },
  'multi-tenancy':         { title:'Multi-tenancy',  tags:['tenant scoping','row isolation','scoped storage'] },
  'saas-billing':          { title:'SaaS billing',   tags:['plans','entitlements','seats','usage','webhooks'] },
  'otp-auth':              { title:'OTP auth',       tags:['OTP','SMS','email','challenge store'] },
  'llm-calls':             { title:'LLM calls',      tags:['provider adapter','cost caps','canned mode'] },
  'enterprise-compliance': { title:'Compliance',     tags:['SSO','MFA','audit log','retention'] },
  'test-mode':             { title:'Test mode',      tags:['stubbed sinks','test users'] },
  'seo':                   { title:'SEO',            tags:['metadata','sitemap','crawlability'] },
  'premium-design':        { title:'Premium design', tags:['motion','art direction','craft gate'] },
}

const DESC = {
  'vercel':                     'Client-rendered React. No server rendering.',
  'vercel-ssr':                 'Server-rendered Next.js. Marketing and app in one deployment.',
  'nextjs-nestjs-postgres':     'Separate API service with its own lifecycle.',
  'taro-fastify-mysql-tencent': 'WeChat mini-program, hosted in mainland China.',
  'multi-tenancy':         'Organisations share one deployment, data stays isolated.',
  'saas-billing':          'Subscriptions, entitlements and seats as a layer.',
  'otp-auth':              'Sign in with a code sent by SMS or email.',
  'llm-calls':             'Guardrails for features that call an AI model.',
  'enterprise-compliance': 'Controls for SOC 2, ISO 27001, GDPR and PDPA.',
  'test-mode':             'Run end to end with every external side effect stubbed.',
  'seo':                   'Findable by search engines.',
  'premium-design':        'Art direction and motion for the screens that carry the product.',
}

const titleise = id => id.replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase())

/** First real sentence of a README, for a directory we have no blurb for. */
function fromReadme (dir) {
  for (const name of ['README.md', 'readme.md']) {
    const p = path.join(dir, name)
    if (!fs.existsSync(p)) continue
    const body = fs.readFileSync(p, 'utf8')
      .replace(/^---[\s\S]*?---\s*/, '')
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'))
      .join(' ')
    const s = body.replace(/[*`_[\]]/g, '').trim().split(/(?<=\.)\s/)[0]
    if (s) return s.length > 120 ? s.slice(0, 117).trimEnd() + '…' : s
  }
  return ''
}

function scan (sub) {
  const root = path.join(REPO, sub)
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => ({
      id: d.name,
      title: KNOWN[d.name]?.title ?? titleise(d.name),
      desc:  DESC[d.name] ?? fromReadme(path.join(root, d.name)),
      tags:  KNOWN[d.name]?.tags ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

const inventory = {
  project: path.basename(REPO),
  base: ['CLAUDE.md', 'apps/', 'db/', 'design/', 'specs/', 'infra/', '.github/']
    .filter(p => fs.existsSync(path.join(REPO, p.replace(/\/$/, '')))),
  packs: scan('stacks'),
  addons: scan('add-ons'),
}

if (!inventory.packs.length) {
  console.error('stacks/ has no packs — nothing to choose from')
  process.exit(2)
}

const page = fs.readFileSync(path.join(HERE, 'chooser.html'), 'utf8').replace(
  /(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/,
  (_m, a, b) => a + '\n' + JSON.stringify(inventory, null, 2) + '\n' + b,
)

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

let answered = false

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', page)
  }

  if (req.method === 'POST' && url.pathname === '/choose') {
    if (answered) return send(res, 409, 'application/json', '{"error":"already answered"}')
    let body = ''
    req.on('data', c => {
      body += c
      if (body.length > 1e6) req.destroy()          // a choice is a few hundred bytes
    })
    req.on('end', () => {
      let choice
      try { choice = JSON.parse(body) } catch { return send(res, 400, 'application/json', '{"error":"bad json"}') }

      const ids = new Set(inventory.packs.map(p => p.id))
      if (!choice.pack || !ids.has(choice.pack)) {
        return send(res, 400, 'application/json', '{"error":"unknown pack"}')
      }
      const addonIds = new Set(inventory.addons.map(a => a.id))
      choice.addons = (choice.addons || []).filter(a => addonIds.has(a))

      answered = true
      const record = {
        version: 1,
        repo: REPO,
        pack: choice.pack,
        addons: choice.addons,
        deleting: {
          packs:  inventory.packs.filter(p => p.id !== choice.pack).map(p => p.id),
          addons: inventory.addons.filter(a => !choice.addons.includes(a.id)).map(a => a.id),
        },
        at: new Date().toISOString(),
      }
      fs.mkdirSync(path.dirname(OUT), { recursive: true })
      fs.writeFileSync(OUT, JSON.stringify(record, null, 2))
      send(res, 200, 'application/json', '{"ok":true}')

      console.log(`\n✓ ${record.pack}` +
        (record.addons.length ? ` + ${record.addons.join(', ')}` : ' (no add-ons)') +
        `\n  deleting ${record.deleting.packs.length} pack(s) and ${record.deleting.addons.length} add-on(s)` +
        `\n  ${OUT}`)
      // let the response land before the socket goes with the process
      setTimeout(() => { server.close(); process.exit(0) }, 250)
    })
    return
  }

  send(res, 404, 'text/plain', 'not found')
})

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `port ${PORT} is busy — pass --port`
    : String(e))
  process.exit(2)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`chooser for ${inventory.project}`)
  console.log(`  ${inventory.packs.length} pack(s) · ${inventory.addons.length} add-on(s)`)
  console.log(`  open http://localhost:${PORT}/`)
})

process.on('SIGINT', () => { console.log('\nno choice made'); process.exit(1) })

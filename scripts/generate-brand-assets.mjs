#!/usr/bin/env node
// Generates docs/brand/ — run with: node scripts/generate-brand-assets.mjs
// SVGs are written with no dependencies. PNGs need `sharp` on the module path
// (npm i sharp, or run from a checkout that already has it); without it the
// script writes the SVGs and skips rasterizing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT  = path.join(ROOT, 'docs', 'brand');
fs.mkdirSync(OUT, { recursive: true });

// ── Design tokens (shared with the Cavalry mark — do not drift) ──────────────
const NIGHT = '#0a0810';
const INK   = '#f4eff5';
const RED   = '#ff3b30';

// ── Mark geometry ────────────────────────────────────────────────────────────
// Sibling of the Cavalry monolith: same 64×64 block, same margins, same red
// cut-face at x=46 w=12. Where Cavalry carves a C, Visual Stack cuts the block
// into three strata — and the top one, the layer you actually see, carries the
// red face. Keep in sync with the inline marks in plugins/vstack/skills/*.
const SLABS = [
  { x: 6, y: 44, w: 52, h: 16 }, // base
  { x: 6, y: 24, w: 52, h: 16 }, // middle
  { x: 6, y:  4, w: 40, h: 16 }, // top — stops short, the red face completes it
];
const ACCENT = { x: 46, y: 4, w: 12, h: 16 };

const rect = (r, fill) => `  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}"/>`;

function markSvg({ body, accent = RED, bg = 'none', mono = false }) {
  // Mono variants have no second colour, so the top slab runs the full width.
  const slabs = mono
    ? SLABS.map(s => (s.h === 16 && s.w === 40 ? { ...s, w: 52 } : s))
    : SLABS;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    bg !== 'none' ? `  <rect width="64" height="64" fill="${bg}"/>` : null,
    ...slabs.map(s => rect(s, body)),
    mono ? null : rect(ACCENT, accent),
    '</svg>',
  ].filter(Boolean).join('\n');
}

const MARKS = [
  { stem: 'vstack-mark-light',      body: INK,       accent: RED, bg: 'none' },
  { stem: 'vstack-mark-dark',       body: NIGHT,     accent: RED, bg: 'none' },
  { stem: 'vstack-mark-mono-white', body: '#ffffff', mono: true,  bg: 'none' },
  { stem: 'vstack-mark-mono-black', body: '#000000', mono: true,  bg: 'none' },
  { stem: 'vstack-mark-tile',       body: INK,       accent: RED, bg: NIGHT  },
];

console.log('Writing mark SVGs…');
for (const m of MARKS) {
  fs.writeFileSync(path.join(OUT, `${m.stem}.svg`), markSvg(m) + '\n');
  console.log(`  ✓  ${m.stem}.svg`);
}

// ── Rasterize ────────────────────────────────────────────────────────────────
let sharp = null;
try { ({ default: sharp } = await import('sharp')); }
catch { console.log('\nsharp not installed — SVGs written, PNGs skipped.'); }

if (sharp) {
  console.log('Rasterizing PNGs…');
  for (const m of MARKS) {
    const src = path.join(OUT, `${m.stem}.svg`);
    for (const size of [256, 512, 1024]) {
      const dst = path.join(OUT, `${m.stem}-${size}.png`);
      await sharp(src).resize(size, size).png().toFile(dst);
      console.log(`  ✓  ${m.stem}-${size}.png`);
    }
  }
}

// ── Lockup: mark + VISUAL STACK wordmark ─────────────────────────────────────
// Set in Space Mono Bold, like the Cavalry lockup. The SVG imports the font, so
// it renders correctly in a browser; the PNG is rendered with Playwright (needs
// internet for the font) and is what documents should embed.
function lockupSvg({ body, accent = RED, bg = 'none' }) {
  const scale = (70 / 64).toFixed(5);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="110" viewBox="0 0 560 110">',
    `  <defs><style>@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&amp;display=block');</style></defs>`,
    bg !== 'none' ? `  <rect width="560" height="110" fill="${bg}"/>` : null,
    `  <g transform="translate(30,20) scale(${scale})">`,
    ...SLABS.map(s => '  ' + rect(s, body)),
    '  ' + rect(ACCENT, accent),
    '  </g>',
    `  <text x="122" y="70" font-family="'Space Mono',monospace" font-weight="700" font-size="34" letter-spacing="7" fill="${body}">VISUAL STACK</text>`,
    '</svg>',
  ].filter(Boolean).join('\n');
}

const LOCKUPS = [
  { stem: 'vstack-lockup-light', body: INK,   bg: 'none' },
  { stem: 'vstack-lockup-dark',  body: NIGHT, bg: 'none' },
  { stem: 'vstack-lockup-tile',  body: INK,   bg: NIGHT  },
];

console.log('Writing lockup SVGs…');
for (const l of LOCKUPS) {
  fs.writeFileSync(path.join(OUT, `${l.stem}.svg`), lockupSvg(l) + '\n');
  console.log(`  ✓  ${l.stem}.svg`);
}

let chromium = null;
try { ({ chromium } = await import('playwright')); }
catch { console.log('playwright not installed — lockup PNGs skipped.'); }

if (chromium) {
  console.log('Rendering lockup PNGs (needs internet for the font)…');
  const browser = await chromium.launch();
  for (const l of LOCKUPS) {
    const page = await browser.newPage({ viewport: { width: 1120, height: 220 }, deviceScaleFactor: 2 });
    await page.setContent(`<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=block" rel="stylesheet">
<style>*{margin:0;padding:0}html,body{width:1120px;height:220px;${l.bg === 'none' ? '' : `background:${l.bg}`}}
.l{display:flex;align-items:center;gap:28px;height:220px;padding:0 60px}
svg{width:110px;height:110px;flex:none}
.w{font:700 74px/1 'Space Mono',monospace;letter-spacing:.2em;color:${l.body};white-space:nowrap}</style></head>
<body><div class="l">${markSvg({ body: l.body })}<span class="w">VISUAL STACK</span></div></body></html>`,
      { waitUntil: 'networkidle' });
    await page.screenshot({
      path: path.join(OUT, `${l.stem}-1120.png`),
      omitBackground: l.bg === 'none',
    });
    await page.close();
    console.log(`  ✓  ${l.stem}-1120.png`);
  }
  await browser.close();
}

console.log(`\nDone. ${fs.readdirSync(OUT).length} files in docs/brand/.`);

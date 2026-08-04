/**
 * harvest-reference.js — read a real page's design decisions off the page.
 *
 * Paste the whole thing into the Chrome javascript tool while the reference site
 * is open, at the width the wireframe will lead with. It returns JSON: the palette
 * by role, the type scale actually in use, the spacing rhythm, radii, shadows,
 * and a sketch of the layout. Nothing is guessed — every number is a value the
 * page is really painting.
 *
 * Why measure instead of eyeball: a palette read off a screenshot is always a
 * little wrong, and "a little wrong" across twenty values is what makes a design
 * look like a knock-off of the thing it is meant to be.
 *
 * Run it once per breakpoint you care about; the layout section is the part that
 * changes. Ignore the cookie banner — dismiss it before running.
 */
(() => {
  const px = v => Math.round(parseFloat(v) || 0);
  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const c = getComputedStyle(el);
    return c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05;
  };

  /* Count what the page actually paints, weighted by how much of it you see —
     a colour on one 1200px-wide header matters more than one on ten icons. */
  const tally = new Map();
  const bump = (bucket, value, weight = 1) => {
    if (!value || value === 'none' || value === 'normal') return;
    const k = bucket + ' ' + value;
    const e = tally.get(k) || { bucket, value, n: 0, area: 0 };
    e.n++; e.area += weight; tally.set(k, e);
  };
  const top = (bucket, n) => [...tally.values()]
    .filter(e => e.bucket === bucket)
    .sort((a, b) => b.area - a.area)
    .slice(0, n)
    .map(e => ({ value: e.value, count: e.n, area: Math.round(e.area) }));

  const els = [...document.querySelectorAll('body *')].filter(vis);
  const TRANSPARENT = /rgba?\([^)]*,\s*0\s*\)|transparent/;

  /* The page's own surface. A page that never sets a background is still white,
     and reporting nothing there would send you off to invent one. */
  const canvas = [document.documentElement, document.body]
    .map(el => getComputedStyle(el).backgroundColor)
    .find(c => c && !TRANSPARENT.test(c)) || 'rgb(255, 255, 255)';
  bump('background', canvas, innerWidth * innerHeight);

  for (const el of els) {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const area = Math.round(r.width * r.height);
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

    if (!TRANSPARENT.test(c.backgroundColor)) bump('background', c.backgroundColor, area);
    if (hasText) {
      bump('text', c.color, r.width * px(c.fontSize));
      // `normal` has no pixel value — say so rather than reporting a 0px leading.
      const lead = parseFloat(c.lineHeight);
      bump('type', `${px(c.fontSize)}px/${c.fontWeight}/${lead ? Math.round(lead) + 'px' : 'normal'}`, r.width);
      bump('family', c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), r.width);
      bump('tracking', c.letterSpacing, r.width);
    }
    // Read the colour off the side that actually has the border — an unset side
    // reports `currentColor`, which would file every text colour as a border.
    for (const side of ['Top', 'Bottom', 'Left']) {
      const w = px(c['border' + side + 'Width']);
      if (w && c['border' + side + 'Style'] !== 'none') { bump('border', `${w}px ${c['border' + side + 'Color']}`, r.width); break }
    }
    if (px(c.borderTopLeftRadius)) bump('radius', c.borderTopLeftRadius, area);
    if (c.boxShadow !== 'none') bump('shadow', c.boxShadow, area);
    for (const side of ['paddingTop', 'paddingLeft', 'gap', 'rowGap', 'marginBottom']) {
      const v = px(c[side]);
      if (v > 0 && v <= 96) bump('spacing', v + 'px', 1);
    }
  }

  /* The shape of the thing, not just its colours: what leads, how wide the
     content runs, whether it navigates from the top or the side. */
  const byArea = els
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(o => o.r.width > 200 && o.r.height > 60)
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  const nav = document.querySelector('nav, [role=navigation], header nav');
  const navRect = nav && nav.getBoundingClientRect();
  // On a page with no <main>, the second-largest block is usually the content
  // column — but on a page that simple there is no second block, so fall back.
  const main = document.querySelector('main, [role=main]') || byArea[1]?.el || byArea[0]?.el;
  const heads = [...document.querySelectorAll('h1,h2,h3')].filter(vis).slice(0, 8)
    .map(h => ({ tag: h.tagName, size: px(getComputedStyle(h).fontSize), weight: getComputedStyle(h).fontWeight, text: h.textContent.trim().slice(0, 60) }));

  return JSON.stringify({
    url: location.href,
    capturedAt: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    palette: { background: top('background', 8), text: top('text', 6), border: top('border', 5) },
    type: { families: top('family', 4), scale: top('type', 12), tracking: top('tracking', 4), headings: heads },
    shape: { radius: top('radius', 5), shadow: top('shadow', 4), spacing: top('spacing', 10) },
    layout: {
      nav: nav ? (navRect.height > navRect.width ? 'side rail' : 'top bar') +
        ` — ${px(navRect.width)}×${px(navRect.height)}` : 'none found',
      contentWidth: main ? px(main.getBoundingClientRect().width) : null,
      grids: [...document.querySelectorAll('*')].filter(el => vis(el) && getComputedStyle(el).display.includes('grid'))
        .slice(0, 5).map(el => getComputedStyle(el).gridTemplateColumns),
      tables: document.querySelectorAll('table, [role=table], [role=grid]').length,
      inputs: document.querySelectorAll('input, select, textarea').length,
    },
  }, null, 2);
})();

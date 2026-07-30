/* The behaviour behind the top bar: theme, language, the link dot, and the
   page's own name. Everything else — what the page does — is the page's.

   Nothing here touches the network or the document beyond the bar, so a page
   works identically served, opened off disk, or published as an Artifact. */
window.VSShell = (function () {
  const $ = s => document.querySelector(s);
  const KEY = { theme: 'vstack:theme', lang: 'vstack:lang' };
  const store = {
    get (k, d) { try { return localStorage.getItem(k) ?? d } catch { return d } },
    set (k, v) { try { localStorage.setItem(k, v) } catch {} },
  };

  /* ── theme: auto (whatever the OS says) / light / dark ──
     Auto is the absence of an override, so the page keeps following the system
     if it changes while open — and an Artifact viewer's own toggle still wins
     the same way it does on a page that never had this control. */
  let theme = store.get(KEY.theme, 'auto');
  function applyTheme () {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('#themeSwitch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
    });
  }
  function setTheme (next) {
    theme = ['auto', 'light', 'dark'].includes(next) ? next : 'auto';
    store.set(KEY.theme, theme);
    applyTheme();
  }

  /* ── language: chrome only. Page content stays as authored. ── */
  const storedLang = store.get(KEY.lang, null);
  let lang = storedLang === 'zh' ? 'zh' : 'en';
  const langListeners = [];
  function applyLang () {
    // zh-CN, not zh: the specific tag is what picks the right font and
    // line-breaking for simplified Chinese.
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('#langSwitch button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
    langListeners.forEach(fn => { try { fn(lang) } catch {} });
  }
  function setLang (next) {
    lang = next === 'zh' ? 'zh' : 'en';
    store.set(KEY.lang, lang);
    applyLang();
  }

  /* ── the live link, said out loud ── */
  function setLink (up, labels) {
    const el = $('#linkDot');
    if (!el) return;
    el.hidden = false;
    el.classList.toggle('on', !!up);
    el.textContent = up ? (labels?.on ?? 'LINKED TO CLAUDE') : (labels?.off ?? 'LINK LOST');
    el.title = up ? '' : (labels?.offTitle ?? '');
  }
  const hideLink = () => { const el = $('#linkDot'); if (el) el.hidden = true };

  function name (pageName, eyebrow) {
    const n = $('#pageName'); const e = $('#pageEyebrow');
    if (n && pageName != null) n.textContent = pageName;
    if (e && eyebrow != null) e.textContent = eyebrow;
  }

  /** Mark the tool itself as unfinished. `false` takes it off again. */
  function wip (on, label) {
    const el = $('#wip');
    if (!el) return;
    el.hidden = !on;
    el.textContent = label || 'Work in progress';
  }

  function init (opts = {}) {
    document.querySelectorAll('#themeSwitch button').forEach(b => {
      b.addEventListener('click', () => setTheme(b.dataset.themeSet));
    });
    document.querySelectorAll('#langSwitch button').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.lang));
    });
    if (opts.onLang) langListeners.push(opts.onLang);
    // `defaultLang` is what the artifact was authored in — it opens that way
    // once, and after that the reader's own choice is the one that sticks.
    if (opts.defaultLang && !storedLang) lang = opts.defaultLang === 'zh' ? 'zh' : 'en';
    if (opts.lang) { lang = opts.lang === 'zh' ? 'zh' : 'en'; store.set(KEY.lang, lang) }
    // Not every page sends something back — the form doesn't — so the primary
    // action stays out of the bar unless a page asks for it.
    const send = $('#send');
    if (send && opts.send) send.hidden = false;
    if (opts.wip) wip(true, typeof opts.wip === 'string' ? opts.wip : undefined);
    name(opts.name, opts.eyebrow);
    applyTheme();
    applyLang();
    return api;
  }

  const api = {
    init, setTheme, setLang, setLink, hideLink, name, wip,
    get theme () { return theme },
    get lang () { return lang },
    onLang (fn) { langListeners.push(fn) },
  };
  return api;
})();

/* ── the scrubber ──
   An ordered set of states and a handle that moves between them: versions on
   the spec and the review workspace, release phases on phase-wireframe. The
   page says what the stops are and what showing one does; this owns the track,
   the ticks, the drag, and the caption.

     VSScrub.mount({ onPick: id => showThat(id) })
     VSScrub.set({ items: [{ id, cap, label, sub }], active: id })

   `cap` is the label under the tick (v3, P2), `label` names the stop, and
   `sub` is the line beneath it — both are escaped here, so a page never has to
   remember to. */
window.VSScrub = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let items = [];
  let active = null;
  let onPick = () => {};
  let wired = false;

  const index = () => Math.max(0, items.findIndex(i => i.id === active));
  const pct = i => items.length < 2 ? 100 : (i / (items.length - 1)) * 100;

  function pickAt (clientX) {
    const track = $('#tlTrack');
    if (!track || !items.length) return null;
    const r = track.getBoundingClientRect();
    return items[Math.round(clamp((clientX - r.left) / r.width, 0, 1) * (items.length - 1))]?.id;
  }
  function pick (id) {
    if (id == null || id === active) return;
    active = id;
    paint();
    onPick(id);
  }
  const step = d => { const n = items[index() + d]; if (n) pick(n.id) };

  function paint () {
    const track = $('#tlTrack');
    if (!track) return;
    const i = index();
    track.querySelectorAll('.tick').forEach(t => t.remove());
    items.forEach((it, k) => {
      const t = document.createElement('div');
      t.className = 'tick' + (k <= i ? ' past' : '');
      t.style.left = pct(k) + '%';
      t.innerHTML = `<span class="cap">${esc(it.cap)}</span>`;
      if (it.label) t.title = it.label;
      t.onclick = e => { e.stopPropagation(); pick(it.id) };
      track.appendChild(t);
    });
    $('#tlHandle').style.left = pct(i) + '%';
    $('#tlFill').style.width = pct(i) + '%';
    const cur = items[i];
    $('#tlMeta').innerHTML = cur
      ? `<div class="row"><b>${esc(cur.cap)}</b> <span class="lab">${esc(cur.label)}</span></div>` +
        `<div class="row">${esc(cur.sub)}</div>`
      : '';
    $('#tlPrev').disabled = i === 0;
    $('#tlNext').disabled = i >= items.length - 1;
  }

  function mount (opts = {}) {
    if (opts.onPick) onPick = opts.onPick;
    if (wired || !$('#tlTrack')) return api;
    wired = true;
    $('#tlPrev').onclick = () => step(-1);
    $('#tlNext').onclick = () => step(1);
    $('#tlHandle').addEventListener('pointerdown', e => {
      e.preventDefault();
      const mv = ev => pick(pickAt(ev.clientX));
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up) };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    $('#tlTrack').addEventListener('pointerdown', e => {
      if (e.target.closest('#tlHandle, .tick')) return;
      pick(pickAt(e.clientX));
    });
    return api;
  }

  const api = {
    mount,
    set ({ items: list, active: a }) {
      if (list) items = list;
      if (a !== undefined) active = a;
      if (active == null && items.length) active = items[items.length - 1].id;
      paint();
      return api;
    },
    get active () { return active },
    get items () { return items },
  };
  return api;
})();

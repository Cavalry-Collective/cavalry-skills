/* The behaviour behind the top bar: theme, language, the link dot, and the
   page's own name. Everything else — what the page does — is the page's.

   Nothing here touches the network or the document beyond the bar, so a page
   works identically served, opened off disk, or published as an Artifact. */
window.VSShell = (function () {
  const $ = s => document.querySelector(s);
  const KEY = { theme: 'vstack:theme', lang: 'vstack:lang', seen: 'vstack:update-seen' };
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
  /* Three states, not two. "The page reached its server" and "an agent session
     is waiting to read what you send" are different facts, and only the second
     is the one anyone actually wants to know. `watching` undefined means the
     page has no way to tell, and the dot behaves as it always did. Host name
     comes from window.__VSTACK_HOST__ (contracts/host.md). */
  let linked = null, linkLabels = null, watching;
  function paintLink () {
    const el = $('#linkDot');
    if (!el || linked === null) return;
    el.hidden = false;
    const idle = linked && watching === false;
    el.classList.toggle('on', linked && !idle);
    el.classList.toggle('idle', !!idle);
    const agent = window.__VSTACK_HOST__?.name || 'agent';
    el.textContent = !linked ? (linkLabels?.off ?? 'LINK LOST')
      : idle ? (linkLabels?.idle ?? 'UNLINKED')
      : (linkLabels?.on ?? `LINKED TO ${String(agent).toUpperCase()}`);
    el.title = !linked ? (linkLabels?.offTitle ?? '')
      : idle ? (linkLabels?.idleTitle ?? '') : '';
  }
  function setLink (up, labels, isWatching) {
    linked = !!up;
    if (labels) linkLabels = labels;
    if (isWatching !== undefined) watching = isWatching;
    paintLink();
  }
  /** The server saying who is listening now, without the page repeating itself. */
  function setWatching (isWatching) {
    if (watching === isWatching) return;
    watching = isWatching;
    paintLink();
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

  /* ── a newer Visual Stack than this one ──
     The server looked it up before serving this page and left the answer on
     `window.__VSTACK_UPDATE__`; nothing here reaches the network. Dismissal is
     remembered per version, so saying "not now" to 4.2 stays said, and 4.3
     asks once. */
  function updateNotice () {
    const info = window.__VSTACK_UPDATE__;
    // Dismissal is per release: saying "not now" to this one stays said, and
    // the next one asks once.
    if (!info?.title || store.get(KEY.seen, '') === info.title) return;
    const bar = document.createElement('div');
    bar.className = 'vs-update';
    bar.innerHTML =
      `<span class="v">${esc(info.pill || 'new')}</span>` +
      `<span class="t">${esc(info.title)}</span>` +
      `<button class="how">How</button><button class="no" aria-label="Dismiss">×</button>`;
    const how = document.createElement('div');
    how.className = 'vs-update-how';
    how.hidden = true;
    const lead = info.howLead || 'To update:';
    how.innerHTML = `<p>${esc(lead)}</p><pre>${esc((info.install || []).join('\n'))}</pre>` +
      (info.auto ? `<p class="auto">${esc(info.auto)}</p>` : '') +
      (info.url ? `<a href="${esc(info.url)}" target="_blank" rel="noopener">What changed</a>` : '');
    bar.appendChild(how);
    bar.querySelector('.how').onclick = () => { how.hidden = !how.hidden };
    bar.querySelector('.no').onclick = () => { store.set(KEY.seen, info.title); bar.remove() };
    const top = $('.vs-topbar');
    if (top) top.insertAdjacentElement('afterend', bar);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* The cog: one button for the two choices nobody makes twice. */
  function wireSettings () {
    const btn = $('#settingsBtn'), menu = $('#settingsMenu');
    if (!btn || !menu) return;
    const open = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)) };
    btn.addEventListener('click', e => { e.stopPropagation(); open(menu.hidden) });
    menu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => open(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) open(false) });
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
    wireSettings();
    applyTheme();
    applyLang();
    updateNotice();
    return api;
  }

  const api = {
    init, setTheme, setLang, setLink, setWatching, hideLink, name, wip,
    get theme () { return theme },
    get lang () { return lang },
    onLang (fn) { langListeners.push(fn) },
  };
  return api;
})();

/* ── the scrubber ──
   An ordered set of states and a handle that moves between them: versions on
   the spec and the review workspace, release phases on phase-preview. The
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

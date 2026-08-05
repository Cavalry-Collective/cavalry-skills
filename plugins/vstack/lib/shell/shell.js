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
    paintLink();
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
     comes from window.__VSTACK_HOST__ (contracts/host.md), so no page bakes a
     product name in; the words live here, in both languages, so no page
     repeats them either. A page with something more specific to say passes
     `labels` to setLink and only those keys win. */
  let linked = null, linkLabels = null, watching;
  function linkWords () {
    const agent = window.__VSTACK_HOST__?.name || 'agent';
    return lang === 'zh' ? {
      on: `已连接 ${agent}`, off: '连接已断开', idle: '未连接',
      idleTitle: `页面是通的，但没有 ${agent} 会话在等待——发送的内容会一直留在这里，直到有会话接手。`,
      offTitle: `${agent} 会话已不再提供此页面——你写的内容只保存在这个标签页里。`,
    } : {
      on: `LINKED TO ${String(agent).toUpperCase()}`, off: 'LINK LOST', idle: 'UNLINKED',
      idleTitle: `This page is live, but no ${agent} session is waiting for it — what you send will sit here until one is.`,
      offTitle: `The ${agent} session is no longer serving this page — anything you write stays in this tab.`,
    };
  }
  function paintLink () {
    const el = $('#linkDot');
    if (!el || linked === null) return;
    el.hidden = false;
    const idle = linked && watching === false;
    el.classList.toggle('on', linked && !idle);
    el.classList.toggle('idle', !!idle);
    const words = linkWords();
    const label = !linked ? (linkLabels?.off ?? words.off)
      : idle ? (linkLabels?.idle ?? words.idle)
      : (linkLabels?.on ?? words.on);
    el.textContent = label;
    // Narrow bars show the dot and not the words, so the title has to say what
    // the words would have — the state that needs no explaining still needs
    // naming when nothing beside the colour is left.
    el.title = (!linked ? (linkLabels?.offTitle ?? words.offTitle)
      : idle ? (linkLabels?.idleTitle ?? words.idleTitle) : '') || label;
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

  /* ── which version is running ──
     The page reports what served it, held from load; the server reports what it
     is on now. A tab open across an update shows both and offers the reload. */
  let pageVersion = null, serverVersion = null;
  function paintVersions () {
    const row = $('#cogAbout');
    if (!row) return;
    row.hidden = !pageVersion && !serverVersion;
    const put = (id, value) => { const el = $(id); if (el) el.textContent = value || '—' };
    put('#cogVersionPage', pageVersion || serverVersion);
    put('#cogVersionServer', serverVersion);
    const line = $('#cogServerLine');
    if (line) line.hidden = !serverVersion;
    const stale = $('#cogStale');
    if (stale) stale.hidden = !(pageVersion && serverVersion && pageVersion !== serverVersion);
  }
  /** What the server is on right now, which a page learns from its own payload. */
  function setServerVersion (version) {
    const next = version || null;
    if (serverVersion === next) return;
    serverVersion = next;
    paintVersions();
  }

  /* ── one live-link client, instead of one per page ──
     Wires the dot to a server: SSE when the page has an event stream, a plain
     poll for a server that only answers /ping. Either way the shell owns the
     socket-to-dot translation and the page only hears about its own events.

       VSShell.connect({ url, on: { push: ev => apply(ev) }, onLink })
       VSShell.connect({ poll: '/ping', onLink })

     SSE reconnects on its own, so the dot only ever reports what is true right
     now. `presence` — who is listening, said by the server rather than guessed
     from the socket — is handled here; every other event is the page's. */
  function connect (opts = {}) {
    const say = up => { setLink(up); try { opts.onLink?.(up) } catch {} };
    if (opts.poll) {
      const tick = async () => {
        try { const r = await fetch(opts.poll, { cache: 'no-store' }); say(r.ok) }
        catch { say(false) }
      };
      tick();
      const timer = setInterval(tick, opts.interval || 5000);
      return { stop: () => clearInterval(timer) };
    }
    const es = new EventSource(opts.url);
    es.onopen = () => say(true);
    es.onerror = () => say(false);
    es.addEventListener('presence', ev => {
      try { setWatching(JSON.parse(ev.data).watching) } catch {}
    });
    for (const [name, fn] of Object.entries(opts.on || {})) es.addEventListener(name, fn);
    return { stop: () => es.close(), source: es };
  }

  /* ── a toast: the page saying "done" without stopping anyone ── */
  let toastTimer = null;
  function toast (msg, ms = 2200) {
    let el = document.querySelector('.vs-toast');
    if (!el) { el = document.createElement('div'); el.className = 'vs-toast'; document.body.appendChild(el) }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  /* ── two-step confirm on one button ──
     First press arms it (class `armed`, plus whatever `arm` repaints); a second
     press inside the window fires; the window closing quietly disarms. The
     page styles `armed` and words the button — this owns only the dance. */
  function armConfirm (btn, { onConfirm, arm, disarm, ms = 4000 } = {}) {
    let timer = null;
    const reset = () => { timer = null; btn.classList.remove('armed'); try { disarm?.() } catch {} };
    btn.addEventListener('click', () => {
      if (timer) { clearTimeout(timer); reset(); onConfirm(); return }
      btn.classList.add('armed');
      try { arm?.() } catch {}
      timer = setTimeout(reset, ms);
    });
    return { armed: () => timer !== null, disarm: () => { if (timer) { clearTimeout(timer); reset() } } };
  }

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
    // the next one asks once. `key` is the release — the sentence reads the
    // same every time, so remembering the sentence would silence every future
    // release too.
    const seen = info?.key || info?.title;
    // Nothing here decides whether a release is worth mentioning yet — the
    // server holds back the first sighting (lib/update-check.mjs), because a
    // page served on an ephemeral port has no memory that outlives its run.
    if (!info?.title || store.get(KEY.seen, '') === seen) return;
    const bar = document.createElement('div');
    bar.className = 'vs-update';
    bar.innerHTML =
      `<span class="v">${esc(info.pill || 'new')}</span>` +
      `<span class="t">${esc(info.title)}</span>` +
      `<button class="how">Update instructions</button>` +
      // Drawn, not typed: the × glyph hangs off the maths axis, so no amount of
      // centring the line box centres the mark you actually see. Same treatment
      // as the cog.
      `<button class="no" aria-label="Dismiss">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" ` +
      `stroke-width="1.6" stroke-linecap="round"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"/>` +
      `</svg></button>`;
    const how = document.createElement('div');
    how.className = 'vs-update-how';
    how.hidden = true;
    const lead = info.howLead || 'To update:';
    how.innerHTML = `<p>${esc(lead)}</p><pre>${esc((info.install || []).join('\n'))}</pre>` +
      (info.auto ? `<p class="auto">${esc(info.auto)}</p>` : '');
    bar.appendChild(how);
    bar.querySelector('.how').onclick = () => { how.hidden = !how.hidden };
    bar.querySelector('.no').onclick = () => {
      store.set(KEY.seen, seen);
      // Say it to the server too, when there is one: this page's memory of it
      // lasts as long as its origin does, which for a server on an ephemeral
      // port is one run. Nothing here depends on the answer.
      if (info.dismiss) {
        try {
          fetch(info.dismiss, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key: seen }),
          }).catch(() => {});
        } catch {}
      }
      bar.remove();
    };
    // Pages lay their chrome out in a row grid — `grid-template-rows:auto 1fr`
    // and the like — so a bare sibling of the bar takes the row meant for the
    // content and gets stretched down the whole window. The notice moves in
    // with the bar instead, leaving the layout the single child it sized for.
    const top = $('.vs-topbar');
    if (!top) return;
    let slot = top.parentElement;
    if (!slot || !slot.classList.contains('vs-chrome')) {
      slot = document.createElement('div');
      slot.className = 'vs-chrome';
      top.insertAdjacentElement('beforebegin', slot);
      slot.appendChild(top);
    }
    slot.appendChild(bar);
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
    pageVersion = (window.__VSTACK_BUILD__ || {}).version || null;
    paintVersions();
    applyTheme();
    applyLang();
    updateNotice();
    return api;
  }

  const api = {
    init, setTheme, setLang, setLink, setWatching, setServerVersion, hideLink, name, wip,
    connect, toast, armConfirm, esc,
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
  const esc = s => window.VSShell.esc(s ?? '');
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
    /** Move one stop back or forward — what arrow keys and the ‹ › buttons do. */
    step,
    get active () { return active },
    get items () { return items },
  };
  return api;
})();

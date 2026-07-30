/* vstack:shell js
   The behaviour behind the top bar: theme, language, the link dot, and the
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
    name(opts.name, opts.eyebrow);
    applyTheme();
    applyLang();
    return api;
  }

  const api = {
    init, setTheme, setLang, setLink, hideLink, name,
    get theme () { return theme },
    get lang () { return lang },
    onLang (fn) { langListeners.push(fn) },
  };
  return api;
})();
/* /vstack:shell js */

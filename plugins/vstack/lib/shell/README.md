# The shell

One top bar, one palette, one set of controls — for every page in the stack.

```
tokens.css   the palette, as roles: --paper --surface --ink --line --brand --ok …
             plus the dark ramp and the light/dark overrides
shell.css    the top bar and what sits in it: .btn .seg .sep .linkdot .banner
topbar.html  the bar itself — mark, page name, eyebrow, slots, theme, language,
             link dot, primary action
shell.js     window.VSShell — theme, language, the link dot, the page name
```

## Why it is stamped, not linked

These pages have to work three ways: served over http, opened straight off disk,
and inlined into an Artifact under a CSP that blocks every external request. A
`<link>` or a `<script src>` fails the third. So the shell is **copied into each
page** by `../build-shell.mjs`, between markers:

```bash
node lib/build-shell.mjs stamp     # write the shell into every page
node lib/build-shell.mjs check     # exit 1 if a page has drifted
```

Edit the files here, run `stamp`, commit both. Never hand-edit a stamped region
in a page — `check` will catch it, and the next `stamp` would overwrite it.

## What a page keeps

Layout, and anything that means something only there: the story map's phase
bands, the board's *new / have / touch*, the spec's priorities. Those live in
the page's own `:root` below the stamped block, with their own dark values.

Page controls go in a **slot**, and survive every stamp:

```html
<!-- vstack:slot tools -->     …before the theme and language switches
<!-- vstack:slot actions -->   …after them, where the primary action belongs
```

## Using it from a page

```js
VSShell.init({ name: 'Spec', eyebrow: 'checkout', send: true });
VSShell.onLang(l => { LANG = l; render() });   // the switch is the shell's
VSShell.setLink(true, { on: t('linked'), off: t('lost') });
VSShell.name('Phase 2 build');                 // when the page renames itself
```

`init` returns the API and is safe to call once, late — after the document the
page renders from has loaded. Language and theme are shared across every vstack
page in the browser (`vstack:lang`, `vstack:theme`), so a reviewer who works in
中文 gets 中文 on the next stage without asking twice.

Theme is three-state: **auto** (follow the OS), light, dark. Auto is the absence
of `data-theme`, which is also what an Artifact viewer's own toggle writes — so
the two never fight.

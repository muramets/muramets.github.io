# CV Portfolio — Ilia Blinov

Static portfolio site in The Verge design language (light theme).
No build step, no framework — ES modules served as-is.

## Run

```bash
npm run dev        # python3 http server on :8000
```

ES modules require a server; opening `index.html` via `file://` won't work.

## Pages

| Page                 | URL                  | Content                              |
|----------------------|----------------------|--------------------------------------|
| About (home)         | `index.html`         | Hero, achievements, roles, contact   |
| Skillsets            | `skillsets.html`     | Empty, ready for card entities       |
| Creator Tools        | `creator-tools.html` | Empty, ready for card entities       |
| Collabs              | `collabs.html`       | Empty, ready for card entities       |

## Architecture

```
css/
  tokens.css        design tokens (source: docs/DESIGN.md)
  base.css          reset, typography, links
  layout.css        header/nav (The Verge structure), sections, footer
  components.css    buttons, story tiles, timeline, forms
  admin.css         edit-mode UI — all rules gated behind body.is-admin
js/
  auth.js           admin gate (isAdmin) — MVP localStorage flag, swappable
  store.js          persistence adapter — MVP localStorage, swappable
  entities.js       entity type registry (achievement, role, card)
  content.js        seed content (default state of all collections)
  render.js         data → DOM, no admin chrome
  admin.js          inline editing, add/delete, toolbar (lazy-loaded)
  main.js           bootstrap
docs/
  DESIGN.md         design source of truth (see below)
```

### Content model

Everything on the site is either:

- an **entity** — `{ id, type, fields }` living in a named collection.
  Containers declare themselves in HTML:
  `<div data-collection="achievements" data-entity-type="achievement">`.
  New entity types (articles, sales cards with price/CTA) are added in
  `entities.js` only — rendering, editing, persistence are generic.
- a **singleton text** — any element with `data-text-id="about.deck"`,
  editable in admin mode, stored in one key/value map.

Content resolution: `localStorage override → seed (content.js)`.
`store.js` is the only module touching persistence; replacing it with a
REST adapter later changes nothing else.

### Admin mode

- Enter: open any page with `?admin=on` · Leave entirely: "Log out" or `?admin=off`
- Toolbar (bottom-left): "Editing: On/Off" toggle, Reset (drop local edits,
  restore seeds), Log out
- Double-click any field or marked text to edit; blur/Escape saves
- Hover an entity → × delete button; below each collection → add button
- While editing is On, clicks on editable links/buttons don't navigate
- Public visitors: `admin.js` isn't even loaded; zero edit UI in the DOM

### Page headers

About keeps the white masthead with the ILIA BLINOV wordmark. Subpages use
The Verge section-band pattern (colored header, page name in display type,
nav recolored): Skillsets — ultraviolet, Creator Tools — mint, Collabs —
yellow. On the real The Verge all sections use the same ultraviolet band;
per-page accents are our variation within the tile palette.

Auth is a stub by design — `auth.js#isAdmin()` is the single seam where a
real backend session check will land.

## Design source of truth

`docs/DESIGN.md`. Token values were extracted live from the
[getdesign.md The Verge Light preview](https://getdesign.md/theverge/design-md);
header/nav structure from The Verge's real light-theme markup.
The old root-level `DESIGN.md` npm export is deprecated — don't reintroduce it.

## Known limitations (MVP)

- Edits live in the browser's localStorage — they are per-browser, not synced.
- No entity reordering UI yet (edit `content.js` seeds or delete/re-add).
- Card variant (mint/featured) not switchable from the UI yet.
- Header/footer markup duplicated across pages (no build step); extract to a
  template if a static-site generator is introduced.

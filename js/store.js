// Persistence: two layers.
//   1. REMOTE — data/content.json in the repo, fetched at boot. This is
//      what every visitor sees; publishing (admin.js) commits it back
//      to GitHub via the API.
//   2. localStorage — the admin's local drafts, layered on top of
//      REMOTE until published. Reset drops drafts back to REMOTE.

const PREFIX = 'cv.v1.';

function key(kind, name) {
  return PREFIX + kind + '.' + name;
}

function localJSON(k) {
  const raw = localStorage.getItem(k);
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

let REMOTE = null;

/** Canonical page key for text/block scoping. URLs are extensionless
    (/about, /skillsets) but stored data keys stay in .html form, with
    the About page canonicalized to its historical /index.html key. */
export function currentPage() {
  let p = location.pathname.replace(/\/$/, '');
  if (p === '' || p === '/about' || p === '/index.html') return '/index.html';
  if (!p.includes('.')) return p + '.html';
  return p;
}

/** Fetch the published content. Must complete before first render. */
export async function initStore() {
  try {
    const res = await fetch('data/content.json', { cache: 'no-cache' });
    if (res.ok) REMOTE = await res.json();
  } catch { REMOTE = null; }
}

export const store = {
  /* ── Content variants (personas) ───────────────────────────── */

  getVariants() {
    const local = localJSON(PREFIX + 'variants');
    if (Array.isArray(local) && local.length) return local;
    if (Array.isArray(REMOTE?.variants) && REMOTE.variants.length) {
      return REMOTE.variants;
    }
    return [{ id: 'default', label: 'Default' }];
  },

  saveVariants(list) {
    localStorage.setItem(PREFIX + 'variants', JSON.stringify(list));
  },

  getActiveVariant() {
    return localStorage.getItem(PREFIX + 'variant.active')
      || REMOTE?.activeVariant
      || 'default';
  },

  setActiveVariant(id) {
    localStorage.setItem(PREFIX + 'variant.active', id);
  },

  deleteVariantData(id) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX + 'col.' + id + '.')
                || k.startsWith(PREFIX + 'texts.' + id + '.'))
      .forEach(k => localStorage.removeItem(k));
  },

  /** Clone every stored key of one variant (collections + texts on ALL
      pages) into another — a new persona starts as a full copy of the
      one it was created from. Remote data counts as stored. */
  copyVariantData(fromId, toId) {
    // published state first, local drafts override below
    Object.entries(REMOTE?.collections?.[fromId] ?? {}).forEach(([name, items]) => {
      localStorage.setItem(key('col', toId + '.' + name), JSON.stringify(items));
    });
    Object.entries(REMOTE?.texts?.[fromId] ?? {}).forEach(([page, map]) => {
      localStorage.setItem(key('texts', toId + '.' + page), JSON.stringify(map));
    });

    const colFrom = PREFIX + 'col.' + fromId + '.';
    const txtFrom = PREFIX + 'texts.' + fromId + '.';
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(colFrom)) {
        localStorage.setItem(PREFIX + 'col.' + toId + '.' + k.slice(colFrom.length), localStorage.getItem(k));
      } else if (k.startsWith(txtFrom)) {
        localStorage.setItem(PREFIX + 'texts.' + toId + '.' + k.slice(txtFrom.length), localStorage.getItem(k));
      } else if (fromId === 'default') {
        // legacy unscoped keys belong to the default variant
        if (k.startsWith(PREFIX + 'col.') && !k.slice((PREFIX + 'col.').length).includes('.')) {
          const name = k.slice((PREFIX + 'col.').length);
          if (!localStorage.getItem(colFrom + name)) {
            localStorage.setItem(PREFIX + 'col.' + toId + '.' + name, localStorage.getItem(k));
          }
        } else if (k.startsWith(PREFIX + 'texts./')) {
          const page = k.slice((PREFIX + 'texts.').length);
          if (!localStorage.getItem(txtFrom + page)) {
            localStorage.setItem(PREFIX + 'texts.' + toId + '.' + page, localStorage.getItem(k));
          }
        }
      }
    });
  },

  /** @returns {Array|null} collection for the active variant:
      local draft → published remote → null (render falls back to seeds) */
  loadCollection(name) {
    const variant = this.getActiveVariant();
    const local = localJSON(key('col', variant + '.' + name))
      ?? (variant === 'default' ? localJSON(key('col', name)) : undefined);
    if (local !== undefined) return local;
    return REMOTE?.collections?.[variant]?.[name] ?? null;
  },

  saveCollection(name, items) {
    const variant = this.getActiveVariant();
    localStorage.setItem(key('col', variant + '.' + name), JSON.stringify(items));
  },

  /** Singleton texts, scoped per variant AND per page.
      @returns {Object} map of textId -> html */
  loadTexts(page) {
    const variant = this.getActiveVariant();
    const local = localJSON(key('texts', variant + '.' + page))
      ?? (variant === 'default' ? localJSON(key('texts', page)) : undefined);
    if (local !== undefined) return local || {};
    return REMOTE?.texts?.[variant]?.[page] ?? {};
  },

  saveTexts(page, map) {
    const variant = this.getActiveVariant();
    localStorage.setItem(key('texts', variant + '.' + page), JSON.stringify(map));
  },

  /** @returns {string[]|null} block order for a page */
  loadBlockOrder(page) {
    return localJSON(key('blocks', page)) ?? REMOTE?.blocks?.[page] ?? null;
  },

  saveBlockOrder(page, ids) {
    localStorage.setItem(key('blocks', page), JSON.stringify(ids));
  },

  /** @returns {string[]|null} footer column order for a page */
  loadFooterColOrder(page) {
    return localJSON(key('footerCols', page)) ?? REMOTE?.footerCols?.[page] ?? null;
  },

  saveFooterColOrder(page, ids) {
    localStorage.setItem(key('footerCols', page), JSON.stringify(ids));
  },

  /** Drop local drafts — site falls back to the published content. */
  resetAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX)
                && k !== PREFIX + 'admin'
                && k !== PREFIX + 'gh-token')
      .forEach(k => localStorage.removeItem(k));
  },

  /** Full site state (published + local drafts merged) — the payload
      that Publish commits to data/content.json. */
  exportSnapshot() {
    const snap = {
      version: 1,
      variants: this.getVariants(),
      activeVariant: this.getActiveVariant(),
      collections: structuredClone(REMOTE?.collections ?? {}),
      texts: structuredClone(REMOTE?.texts ?? {}),
      blocks: structuredClone(REMOTE?.blocks ?? {}),
      footerCols: structuredClone(REMOTE?.footerCols ?? {}),
    };
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PREFIX + 'col.')) {
        const rest = k.slice((PREFIX + 'col.').length);
        const dot = rest.indexOf('.');
        const [v, name] = dot === -1 ? ['default', rest] : [rest.slice(0, dot), rest.slice(dot + 1)];
        if (dot === -1 && snap.collections.default?.[name] !== undefined
            && localStorage.getItem(PREFIX + 'col.default.' + name)) return; // scoped key wins over legacy
        snap.collections[v] = snap.collections[v] || {};
        snap.collections[v][name] = localJSON(k) ?? snap.collections[v][name];
      } else if (k.startsWith(PREFIX + 'texts.')) {
        const rest = k.slice((PREFIX + 'texts.').length);
        let v, page;
        if (rest.startsWith('/')) { v = 'default'; page = rest; }
        else { const dot = rest.indexOf('.'); v = rest.slice(0, dot); page = rest.slice(dot + 1); }
        snap.texts[v] = snap.texts[v] || {};
        snap.texts[v][page] = { ...(snap.texts[v][page] ?? {}), ...(localJSON(k) ?? {}) };
      } else if (k.startsWith(PREFIX + 'blocks.')) {
        snap.blocks[k.slice((PREFIX + 'blocks.').length)] = localJSON(k);
      } else if (k.startsWith(PREFIX + 'footerCols.')) {
        snap.footerCols[k.slice((PREFIX + 'footerCols.').length)] = localJSON(k);
      }
    });
    // drop data of deleted variants
    const ids = new Set(snap.variants.map(v => v.id));
    Object.keys(snap.collections).forEach(v => { if (!ids.has(v)) delete snap.collections[v]; });
    Object.keys(snap.texts).forEach(v => { if (!ids.has(v)) delete snap.texts[v]; });
    return snap;
  },
};

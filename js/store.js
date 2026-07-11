// Persistence adapter. MVP: localStorage. The interface (load/save/reset) is
// the contract — a future RemoteStore (REST/DB) implements the same four
// functions and the rest of the app doesn't change.

const PREFIX = 'cv.v1.';

function key(kind, name) {
  return PREFIX + kind + '.' + name;
}

export const store = {
  /** @returns {Array|null} saved collection or null if untouched */
  loadCollection(name) {
    const raw = localStorage.getItem(key('col', name));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  saveCollection(name, items) {
    localStorage.setItem(key('col', name), JSON.stringify(items));
  },

  /** Singleton texts are scoped per page — every page owns its footer,
      titles, etc. @returns {Object} map of textId -> html */
  loadTexts(page) {
    const raw = localStorage.getItem(key('texts', page));
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  },

  saveTexts(page, map) {
    localStorage.setItem(key('texts', page), JSON.stringify(map));
  },

  /** @returns {string[]|null} saved block order for a page, or null */
  loadBlockOrder(page) {
    const raw = localStorage.getItem(key('blocks', page));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  saveBlockOrder(page, ids) {
    localStorage.setItem(key('blocks', page), JSON.stringify(ids));
  },

  /** Drop all local overrides — site falls back to seed content. */
  resetAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX) && k !== PREFIX + 'admin')
      .forEach(k => localStorage.removeItem(k));
  },
};

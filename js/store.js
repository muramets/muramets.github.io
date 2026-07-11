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

  /** @returns {Object} map of textId -> html for singleton editable texts */
  loadTexts() {
    const raw = localStorage.getItem(key('map', 'texts'));
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  },

  saveTexts(map) {
    localStorage.setItem(key('map', 'texts'), JSON.stringify(map));
  },

  /** Drop all local overrides — site falls back to seed content. */
  resetAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX) && k !== PREFIX + 'admin')
      .forEach(k => localStorage.removeItem(k));
  },
};

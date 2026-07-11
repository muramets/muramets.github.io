// Rendering: data → DOM. Pure output, no admin chrome — admin.js decorates
// rendered entities separately when admin mode is on.

import { ENTITY_TYPES } from './entities.js';
import { store } from './store.js';
import { SEED } from './content.js';

/** Resolve current items for a collection: local override or seed. */
export function getItems(name) {
  return store.loadCollection(name) ?? structuredClone(SEED[name] ?? []);
}

/** Render one collection into its container. Returns the items rendered. */
export function renderCollection(container, items) {
  container.innerHTML = '';
  items.forEach((entity, index) => {
    const type = ENTITY_TYPES[entity.type];
    if (!type) return;
    container.append(type.render(entity, index));
  });
  return items;
}

/** Render every [data-collection] container on the page.
    Returns a map: name -> { container, items }. */
export function renderPage() {
  const state = {};
  document.querySelectorAll('[data-collection]').forEach(container => {
    const name = container.dataset.collection;
    const items = getItems(name);
    renderCollection(container, items);
    state[name] = { container, items };

    if (items.length === 0 && container.dataset.emptyNote) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = container.dataset.emptyNote;
      container.append(note);
    }
  });
  return state;
}

/** Apply saved singleton texts to [data-text-id] elements. */
export function applyTexts() {
  const texts = store.loadTexts();
  document.querySelectorAll('[data-text-id]').forEach(node => {
    const saved = texts[node.dataset.textId];
    if (saved !== undefined) node.innerHTML = saved;
  });
}

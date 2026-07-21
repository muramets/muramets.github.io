// Rendering: data → DOM. Pure output, no admin chrome — admin.js decorates
// rendered entities separately when admin mode is on.

import { ENTITY_TYPES } from './entities.js?v=29';
import { store, currentPage } from './store.js?v=29';
import { SEED } from './content.js?v=29';

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

/** Public visitors don't see nav links to pages that have no content
    yet; the admin keeps the full nav to be able to fill them.
    Maps nav href -> the collection that feeds that page. */
const NAV_COLLECTIONS = {
  'skillsets': 'skillsets',
  'creator-tools': 'tools',
  'collabs': 'collabs',
};

export function pruneEmptyNav() {
  document.querySelectorAll('.vnav a[href]').forEach(a => {
    const name = NAV_COLLECTIONS[a.getAttribute('href')];
    // remove (not hide): the "/" separator is :last-child-driven CSS,
    // so the remaining links must be real last children
    if (name && getItems(name).length === 0) a.closest('li')?.remove();
  });
}

/** Apply saved singleton texts to [data-text-id] elements (scoped per
    variant + page). Original markup is cached on first run so switching
    to a variant without an override restores the seed text. */
const originalTexts = new Map();

export function applyTexts() {
  const texts = store.loadTexts(currentPage());
  document.querySelectorAll('[data-text-id]').forEach(node => {
    const id = node.dataset.textId;
    if (!originalTexts.has(id)) originalTexts.set(id, node.innerHTML);
    const saved = texts[id];
    node.innerHTML = saved !== undefined ? saved : originalTexts.get(id);
  });
}

/** Reorder page blocks ([data-block-id] sections) per saved order.
    Runs for every visitor — block order is content, not admin chrome. */
export function applyBlockOrder() {
  const ids = store.loadBlockOrder(currentPage());
  if (!ids) return;
  const blocks = [...document.querySelectorAll('[data-block-id]')];
  if (blocks.length < 2) return;
  const byId = new Map(blocks.map(b => [b.dataset.blockId, b]));
  const anchor = blocks[blocks.length - 1].nextSibling; // whatever follows the last block
  const parent = blocks[0].parentNode;
  ids.forEach(id => {
    const block = byId.get(id);
    if (block) parent.insertBefore(block, anchor);
  });
}

// Admin mode: inline editing, add/delete entities, toolbar.
// Initialized ONLY when auth.isAdmin() — public visitors never load this UI.

import { ENTITY_TYPES } from './entities.js?v=20';
import { store } from './store.js?v=20';
import { renderCollection, getItems, applyTexts } from './render.js?v=20';
import { logout } from './auth.js?v=20';
import { makeSortable, createHandle } from './dnd.js?v=20';

let pageState = null; // { name: { container, items } }

function findEntity(name, id) {
  return pageState[name].items.find(e => e.id === id);
}

/* ── Undo (Cmd/Ctrl+Z) ─────────────────────────────────────── */

const undoStack = [];
const UNDO_LIMIT = 50;

function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function snapshotCollection(name) {
  pushUndo({ kind: 'collection', name, items: structuredClone(pageState[name].items) });
}

function undo() {
  const entry = undoStack.pop();
  if (!entry) return;

  if (entry.kind === 'collection') {
    pageState[entry.name].items = entry.items;
    store.saveCollection(entry.name, entry.items);
    rerender(entry.name);

  } else if (entry.kind === 'text') {
    const page = location.pathname;
    const texts = store.loadTexts(page);
    texts[entry.textId] = entry.prevHtml;
    store.saveTexts(page, texts);
    const node = document.querySelector(`[data-text-id="${CSS.escape(entry.textId)}"]`);
    if (node) node.innerHTML = entry.prevHtml;

  } else if (entry.kind === 'blocks') {
    store.saveBlockOrder(location.pathname, entry.order);
    applyBlockOrderDom(entry.order);
    lastBlockOrder = entry.order;
  }
}

function applyBlockOrderDom(ids) {
  const blocks = [...document.querySelectorAll('[data-block-id]')];
  if (blocks.length < 2) return;
  const byId = new Map(blocks.map(b => [b.dataset.blockId, b]));
  const anchor = blocks[blocks.length - 1].nextSibling;
  const parent = blocks[0].parentNode;
  ids.forEach(id => {
    const block = byId.get(id);
    if (block) parent.insertBefore(block, anchor);
  });
}

function onUndoKey(e) {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  if (!document.body.classList.contains('is-admin')) return;
  if (document.activeElement?.isContentEditable) return; // native undo while typing
  e.preventDefault();
  undo();
}

function collectionOf(node) {
  const container = node.closest('[data-collection]');
  return container ? container.dataset.collection : null;
}

/* ── Field editing ─────────────────────────────────────────── */

function commitField(node) {
  const name = collectionOf(node);
  const entityId = node.closest('[data-entity-id]')?.dataset.entityId;
  const field = node.dataset.field;
  if (!name || !entityId || !field) return;

  const entity = findEntity(name, entityId);
  if (!entity) return;

  const isBullet = field.startsWith('bullets.');
  const prev = isBullet
    ? entity.fields.bullets[Number(field.split('.')[1])]
    : entity.fields[field];
  if (prev === node.innerHTML) return; // nothing changed

  snapshotCollection(name);
  if (isBullet) {
    entity.fields.bullets[Number(field.split('.')[1])] = node.innerHTML;
  } else {
    entity.fields[field] = node.innerHTML;
  }
  store.saveCollection(name, pageState[name].items);
  // period drives the computed tenure line — re-render to refresh it
  if (field === 'period') rerender(name);
}

function commitText(node, prevHtml) {
  if (prevHtml === node.innerHTML) return; // nothing changed
  pushUndo({ kind: 'text', textId: node.dataset.textId, prevHtml });
  const page = location.pathname;
  const texts = store.loadTexts(page);
  texts[node.dataset.textId] = node.innerHTML;
  store.saveTexts(page, texts);
}

function startEditing(node) {
  const prevHtml = node.innerHTML; // for undo of text edits
  node.contentEditable = 'true';
  node.focus();

  const stop = () => {
    node.contentEditable = 'false';
    node.removeEventListener('blur', stop);
    node.removeEventListener('keydown', onKey);
    if (node.dataset.field !== undefined) commitField(node);
    else if (node.dataset.textId !== undefined) commitText(node, prevHtml);
  };
  const onKey = ev => { if (ev.key === 'Escape') node.blur(); };

  node.addEventListener('blur', stop);
  node.addEventListener('keydown', onKey);
}

function onDblClick(e) {
  if (!document.body.classList.contains('is-admin')) return;
  const target = e.target.closest('[data-field], [data-text-id]');
  if (!target || target.isContentEditable) return;
  e.preventDefault();
  startEditing(target);
}

/* While editing is on, single clicks on editable links/buttons must not
   navigate or submit — otherwise double-click editing is impossible on them. */
function onClickGuard(e) {
  if (!document.body.classList.contains('is-admin')) return;
  if (e.target.closest('a[data-text-id], button[data-text-id]')) {
    e.preventDefault();
  }
}

/* ── Entity add / delete ───────────────────────────────────── */

function decorateEntities(name) {
  const { container } = pageState[name];
  container.querySelectorAll('[data-entity-id]').forEach(node => {
    if (node.querySelector(':scope > .entity-delete')) return;
    const btn = document.createElement('button');
    btn.className = 'entity-delete';
    btn.setAttribute('aria-label', 'Delete');
    btn.textContent = '×';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteEntity(name, node.dataset.entityId);
    });
    node.append(btn, createHandle('Drag to reorder'));
  });
}

/* Persist the DOM order of a collection back into its items array. */
function commitEntityOrder(name) {
  const state = pageState[name];
  const domOrder = [...state.container.querySelectorAll('[data-entity-id]')]
    .map(node => node.dataset.entityId);
  snapshotCollection(name);
  state.items.sort((a, b) => domOrder.indexOf(a.id) - domOrder.indexOf(b.id));
  store.saveCollection(name, state.items);
  rerender(name); // re-render so index-based styling (role accents) follows
}

/* Whole page blocks ([data-block-id]) are sortable too. */
let lastBlockOrder = null;

function initBlockSorting() {
  const blocks = [...document.querySelectorAll('[data-block-id]')];
  if (blocks.length < 2) return;
  lastBlockOrder = blocks.map(b => b.dataset.blockId);
  blocks.forEach(block => block.append(createHandle('Drag to move block')));
  makeSortable({
    container: blocks[0].parentNode,
    itemSelector: '[data-block-id]',
    onReorder() {
      const ids = [...document.querySelectorAll('[data-block-id]')]
        .map(b => b.dataset.blockId);
      pushUndo({ kind: 'blocks', order: lastBlockOrder });
      lastBlockOrder = ids;
      store.saveBlockOrder(location.pathname, ids);
    },
  });
}

function deleteEntity(name, id) {
  snapshotCollection(name);
  const state = pageState[name];
  state.items = state.items.filter(e => e.id !== id);
  store.saveCollection(name, state.items);
  rerender(name);
}

function addEntity(name) {
  const state = pageState[name];
  const type = state.container.dataset.entityType;
  const blank = ENTITY_TYPES[type]?.blank();
  if (!blank) return;
  snapshotCollection(name);
  state.items.push(blank);
  store.saveCollection(name, state.items);
  rerender(name);
}

function rerender(name) {
  const state = pageState[name];
  renderCollection(state.container, state.items);
  decorateEntities(name);
}

function injectAddButtons() {
  Object.entries(pageState).forEach(([name, { container }]) => {
    const label = container.dataset.addLabel || '+ Add item';
    const btn = document.createElement('button');
    btn.className = 'entity-add';
    btn.textContent = label;
    btn.addEventListener('click', () => addEntity(name));
    container.after(btn);
  });
}

/* ── Content variants (personas) — The Verge-style tab toggle ── */

function switchVariant(id) {
  store.setActiveVariant(id);
  Object.keys(pageState).forEach(name => {
    pageState[name].items = getItems(name);
    rerender(name);
  });
  applyTexts(); // persona owns the page copy too (hero deck, footer, titles)
  undoStack.length = 0; // undo entries belong to the previous variant
  renderVariantBar();
}

function addVariant() {
  const variants = store.getVariants();
  const current = store.getActiveVariant();
  const id = 'v' + Date.now().toString(36);
  const label = 'Variant ' + (variants.length + 1);
  variants.push({ id, label });
  store.saveVariants(variants);
  // full copy of the CURRENT persona: stored collections and texts of
  // every page, then a snapshot of what's rendered right now (covers
  // seed-only collections never saved before)
  store.copyVariantData(current, id);
  store.setActiveVariant(id);
  Object.keys(pageState).forEach(name =>
    store.saveCollection(name, structuredClone(pageState[name].items)));
  switchVariant(id);
}

function deleteVariant(id) {
  let variants = store.getVariants().filter(v => v.id !== id);
  if (!variants.length) return; // never delete the last persona
  store.saveVariants(variants);
  store.deleteVariantData(id);
  switchVariant(store.getActiveVariant() === id ? variants[0].id : store.getActiveVariant());
}

function renameVariant(id, label) {
  const variants = store.getVariants();
  const v = variants.find(v => v.id === id);
  // collapse nbsp (inserted while typing) and duplicate whitespace
  const clean = label.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (v && clean) { v.label = clean; store.saveVariants(variants); }
  renderVariantBar();
}

function renderVariantBar() {
  const shell = document.querySelector('.variant-bar');
  if (!shell) return;
  const active = store.getActiveVariant();
  const inner = shell.querySelector('.variant-bar-inner');
  inner.innerHTML = '';

  store.getVariants().forEach(v => {
    const tab = document.createElement('span');
    tab.className = 'variant-tab' + (v.id === active ? ' is-active' : '');

    const label = document.createElement('button');
    label.className = 'variant-tab-label';
    label.textContent = v.label;
    label.title = 'Click to switch · double-click to rename';
    label.addEventListener('click', () => { if (v.id !== active) switchVariant(v.id); });
    label.addEventListener('dblclick', e => {
      e.stopPropagation();
      label.contentEditable = 'true';
      label.focus();
      const done = () => {
        label.contentEditable = 'false';
        renameVariant(v.id, label.textContent);
      };
      label.addEventListener('blur', done, { once: true });
      label.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); label.blur(); }
        // <button> would treat Space as a click — insert the space instead
        if (ev.key === ' ') { ev.preventDefault(); document.execCommand('insertText', false, ' '); }
      });
    });
    tab.append(label);

    if (store.getVariants().length > 1) {
      const del = document.createElement('button');
      del.className = 'variant-tab-del';
      del.textContent = '×';
      del.title = 'Delete this persona';
      del.addEventListener('click', e => { e.stopPropagation(); deleteVariant(v.id); });
      tab.append(del);
    }
    inner.append(tab);
  });

  const add = document.createElement('button');
  add.className = 'variant-tab-add';
  add.textContent = '+';
  add.title = 'New persona (copies the current one)';
  add.addEventListener('click', addVariant);
  inner.append(add);
}

function injectVariantBar() {
  // Top-level control: personas swap the whole site's content
  // (collections AND page texts). On About it sits in the hero button
  // row (next to Email Me); pages without hero buttons get it on the
  // nav row instead.
  const shell = document.createElement('div');
  shell.className = 'variant-bar';
  shell.innerHTML = '<div class="variant-bar-inner"></div>';
  const heroButtons = document.querySelector('.hero-buttons');
  if (heroButtons) heroButtons.append(shell);
  else document.querySelector('.vnav')?.prepend(shell);
  renderVariantBar();
}

/* ── Toolbar ───────────────────────────────────────────────── */

const EDITING_KEY = 'cv.v1.editing';

function isEditing() {
  return localStorage.getItem(EDITING_KEY) !== '0';
}

function setEditing(on) {
  localStorage.setItem(EDITING_KEY, on ? '1' : '0');
  document.body.classList.toggle('is-admin', on);
  const btn = document.querySelector('.admin-toggle');
  if (btn) {
    btn.textContent = on ? 'Editing: On' : 'Editing: Off';
    btn.classList.toggle('is-on', on);
  }
  document.querySelector('.admin-toolbar')?.classList.toggle('is-collapsed', !on);
}

function injectToolbar() {
  const bar = document.createElement('div');
  bar.className = 'admin-toolbar';
  bar.innerHTML = `
    <span class="admin-dot"></span>
    <span>Admin</span>
    <button class="admin-toggle" title="Toggle edit mode on/off"></button>
    <button class="admin-reset" title="Discard local edits, restore seed content">Reset</button>
    <button class="admin-exit" title="Leave admin entirely (return via ?admin=on)">Log out</button>
  `;
  bar.querySelector('.admin-toggle').addEventListener('click', () => setEditing(!isEditing()));
  bar.querySelector('.admin-reset').addEventListener('click', () => {
    store.resetAll();
    location.reload();
  });
  bar.querySelector('.admin-exit').addEventListener('click', logout);
  document.body.append(bar);
}

/* ── Entry point ───────────────────────────────────────────── */

export function initAdmin(state) {
  pageState = state;
  document.body.classList.add('admin-authed');
  document.addEventListener('dblclick', onDblClick);
  document.addEventListener('click', onClickGuard, true);
  document.addEventListener('keydown', onUndoKey);
  Object.keys(pageState).forEach(name => {
    decorateEntities(name);
    makeSortable({
      container: pageState[name].container,
      itemSelector: '[data-entity-id]',
      onReorder: () => commitEntityOrder(name),
    });
  });
  initBlockSorting();
  injectAddButtons();
  injectVariantBar();
  injectToolbar();
  setEditing(isEditing());
}

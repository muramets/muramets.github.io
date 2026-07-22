// Admin mode: inline editing, add/delete entities, toolbar.
// Initialized ONLY when auth.isAdmin() — public visitors never load this UI.

import { ENTITY_TYPES } from './entities.js?v=40';
import { store, currentPage } from './store.js?v=40';
import { renderCollection, getItems, applyTexts } from './render.js?v=40';
import { logout } from './auth.js?v=40';
import { makeSortable, createHandle } from './dnd.js?v=40';

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
    const page = currentPage();
    const texts = store.loadTexts(page);
    texts[entry.textId] = entry.prevHtml;
    store.saveTexts(page, texts);
    const node = document.querySelector(`[data-text-id="${CSS.escape(entry.textId)}"]`);
    if (node) node.innerHTML = entry.prevHtml;

  } else if (entry.kind === 'blocks') {
    store.saveBlockOrder(currentPage(), entry.order);
    applyBlockOrderDom(entry.order);
    lastBlockOrder = entry.order;

  } else if (entry.kind === 'footerCols') {
    store.saveFooterColOrder(currentPage(), entry.order);
    applyFooterColOrderDom(entry.order);
    lastFooterColOrder = entry.order;

  } else if (entry.kind === 'textsBatch') {
    const page = currentPage();
    const texts = store.loadTexts(page);
    Object.entries(entry.changes).forEach(([id, prevHtml]) => {
      if (prevHtml === undefined) delete texts[id];
      else texts[id] = prevHtml;
      const node = document.querySelector(`[data-text-id="${CSS.escape(id)}"]`);
      if (node) {
        node.innerHTML = prevHtml ?? '';
        decorateFooterLine(node);
      }
    });
    store.saveTexts(page, texts);
    document.querySelectorAll('[data-footer-col-id]').forEach(placeFooterAddButton);
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

function applyFooterColOrderDom(ids) {
  const cols = [...document.querySelectorAll('[data-footer-col-id]')];
  if (cols.length < 2) return;
  const byId = new Map(cols.map(c => [c.dataset.footerColId, c]));
  const grid = cols[0].parentNode;
  ids.forEach(id => {
    const col = byId.get(id);
    if (col) grid.appendChild(col);
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

/* Bullets are a list inside one entity: Enter splits in a new bullet,
   an emptied bullet is removed on blur (the last one always stays). */
function bulletContext(node) {
  const name = collectionOf(node);
  const entityId = node.closest('[data-entity-id]')?.dataset.entityId;
  const field = node.dataset.field;
  if (!name || !entityId || !field?.startsWith('bullets.')) return null;
  return { name, entityId, index: Number(field.split('.')[1]) };
}

function insertBulletAfter({ name, entityId, index }) {
  const entity = findEntity(name, entityId);
  if (!entity) return;
  snapshotCollection(name);
  entity.fields.bullets.splice(index + 1, 0, '');
  store.saveCollection(name, pageState[name].items);
  rerender(name);
  const next = document.querySelector(
    `[data-entity-id="${CSS.escape(entityId)}"] [data-field="bullets.${index + 1}"]`);
  if (next) startEditing(next);
}

function removeBullet({ name, entityId, index }) {
  const entity = findEntity(name, entityId);
  if (!entity || entity.fields.bullets.length <= 1) return;
  snapshotCollection(name);
  entity.fields.bullets.splice(index, 1);
  store.saveCollection(name, pageState[name].items);
  rerender(name);
}

/* Outro — an optional closing line under the bullet list (no marker).
   Shift+Enter from a bullet creates it; emptying it removes it. */
function startOutro({ name, entityId }) {
  const entity = findEntity(name, entityId);
  if (!entity) return;
  if (entity.fields.outro == null) {
    snapshotCollection(name);
    entity.fields.outro = '';
    store.saveCollection(name, pageState[name].items);
    rerender(name);
  }
  const node = document.querySelector(
    `[data-entity-id="${CSS.escape(entityId)}"] [data-field="outro"]`);
  if (node) startEditing(node);
}

function removeOutro(node) {
  const name = collectionOf(node);
  const entityId = node.closest('[data-entity-id]')?.dataset.entityId;
  const entity = name && entityId ? findEntity(name, entityId) : null;
  if (!entity || entity.fields.outro == null) return;
  snapshotCollection(name);
  delete entity.fields.outro;
  store.saveCollection(name, pageState[name].items);
  rerender(name);
}

/* Editable nodes may carry admin chrome (drag handles) — never let it
   leak into saved HTML. */
function cleanHTML(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.drag-handle, .entity-delete, .entity-gradcap-toggle').forEach(el => el.remove());
  return clone.innerHTML;
}

/* ── Footer lines ─────────────────────────────────────────────
   Numbered footer texts (footer.<col>.<n>) behave like a list: drag to
   reorder, Enter appends a line, an emptied line is removed. The text
   IDs stay pinned to their slots — only the contents move between
   them, so persistence rides the existing texts store untouched. */

const FOOTER_LINE_RE = /^footer\.([a-z]+)\.(\d+)$/i;

function isFooterLine(node) {
  return !!(node.dataset?.textId?.match(FOOTER_LINE_RE)
    && node.closest('[data-footer-col-id]'));
}

function lineNum(node) {
  return Number(node.dataset.textId.match(FOOTER_LINE_RE)[2]);
}

/* Text of a line WITHOUT admin chrome — the handle glyph (⠿) lives in
   textContent and must never count as content. */
function lineText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.drag-handle, .entity-delete, .entity-gradcap-toggle').forEach(el => el.remove());
  return clone.textContent.trim();
}

function decorateFooterLine(node) {
  if (!node || !isFooterLine(node)) return;
  node.classList.add('footer-line');
  const blank = !lineText(node);
  // legacy "hidden" lines hold stray <br> markup — flatten to truly empty
  if (blank && cleanHTML(node) !== '') {
    node.innerHTML = '';
  }
  node.classList.toggle('is-blank', blank); // compact empty slots (CSS)
  if (!node.querySelector(':scope > .drag-handle')) {
    node.append(createHandle('Drag to reorder'));
  }
}

function footerGroup(node) {
  const key = node.dataset.textId.match(FOOTER_LINE_RE)[1];
  const col = node.closest('[data-footer-col-id]');
  const lines = [...col.querySelectorAll('[data-text-id]')]
    .filter(n => n.dataset.textId.match(FOOTER_LINE_RE)?.[1] === key)
    .sort((a, b) => lineNum(a) - lineNum(b));
  return { col, key, lines };
}

/* Blank slots that JS materialized (not the 4 static markup lines) are
   scratch space for the "+" button — if one gets abandoned empty (blur
   without typing, or a leftover from an earlier session), remove it
   from both the DOM and the texts store instead of piling up forever. */
function pruneBlankFooterLines(col) {
  if (!col) return;
  const page = currentPage();
  const texts = store.loadTexts(page);
  let changed = false;

  col.querySelectorAll('[data-footer-dynamic]').forEach(node => {
    if (node === document.activeElement || lineText(node)) return;
    delete texts[node.dataset.textId];
    node.remove();
    changed = true;
  });

  // Also drop blank scratch keys that never got a DOM node at all — render.js
  // stopped materializing empty footer.<col>.N slots, so old ghost entries
  // from before that fix would otherwise sit in the store forever.
  const colId = col.dataset.footerColId;
  const re = new RegExp('^footer\\.' + colId + '\\.(\\d+)$');
  Object.keys(texts).forEach(id => {
    if (re.test(id) && !texts[id]?.trim()) {
      delete texts[id];
      changed = true;
    }
  });

  if (changed) store.saveTexts(page, texts);
}

/* The "+" sits right after the last line with content (or straight
   under the heading when the group is empty) — never below the tail
   of invisible empty slots. */
function placeFooterAddButton(col) {
  const btn = col.querySelector(':scope > .footer-line-add');
  if (!btn) return;
  const lines = [...col.querySelectorAll('[data-text-id]')]
    .filter(n => FOOTER_LINE_RE.test(n.dataset.textId))
    .sort((a, b) => lineNum(a) - lineNum(b));
  const lastFilled = [...lines].reverse().find(n => lineText(n));
  const anchor = lastFilled ?? col.querySelector('h6');
  if (anchor) anchor.after(btn);
}

/* Write the given contents into the group's slots (id order), saving
   every changed text id as one undoable batch. */
function saveFooterContents(lines, contents) {
  const page = currentPage();
  const texts = store.loadTexts(page);
  const changes = {};
  lines.forEach((n, i) => {
    const id = n.dataset.textId;
    const next = contents[i] ?? '';
    if (texts[id] !== next) {
      changes[id] = texts[id];
      texts[id] = next;
    }
    n.innerHTML = next;
    decorateFooterLine(n);
  });
  if (Object.keys(changes).length) {
    pushUndo({ kind: 'textsBatch', changes });
    store.saveTexts(page, texts);
  }
  if (lines[0]) {
    const col = lines[0].closest('[data-footer-col-id]');
    pruneBlankFooterLines(col);
    placeFooterAddButton(col);
  }
}

function insertFooterLineAfter(node) {
  const { key, lines } = footerGroup(node);
  const idx = lines.indexOf(node);
  if (idx === -1) return;
  const contents = lines.map(cleanHTML);
  contents.splice(idx + 1, 0, '');
  // reuse a trailing empty slot before growing the DOM — but never
  // swallow the very slot we just opened (insert-after-last case)
  while (contents.length > lines.length
      && contents.length - 1 > idx + 1
      && contents[contents.length - 1] === '') {
    contents.pop();
  }
  const all = [...lines];
  if (contents.length > lines.length) {
    const last = lines[lines.length - 1];
    const span = document.createElement('span');
    span.dataset.textId = 'footer.' + key + '.' + (lineNum(last) + 1);
    span.dataset.footerDynamic = '1'; // JS-materialized slot, not static markup
    last.after(span);
    all.push(span);
  }
  saveFooterContents(all, contents);
  startEditing(all[idx + 1]);
}

function removeFooterLine(node) {
  const { lines } = footerGroup(node);
  const idx = lines.indexOf(node);
  if (idx === -1) return;
  const contents = lines.map(cleanHTML);
  contents.splice(idx, 1);
  contents.push(''); // the freed slot goes dark at the end
  saveFooterContents(lines, contents);
}

function commitFooterLineOrder(col) {
  const nodes = [...col.querySelectorAll('.footer-line')];
  const byKey = {};
  nodes.forEach(n => {
    const key = n.dataset.textId.match(FOOTER_LINE_RE)[1];
    (byKey[key] ??= []).push(n); // DOM (visual) order
  });
  Object.values(byKey).forEach(domOrder => {
    if (domOrder.length < 2) return;
    const contents = domOrder.map(cleanHTML);
    const canonical = [...domOrder].sort((a, b) => lineNum(a) - lineNum(b));
    // put the nodes back in id order — contents carry the new sequence
    const marker = document.createComment('');
    domOrder[0].before(marker);
    canonical.forEach(n => marker.before(n));
    marker.remove();
    saveFooterContents(canonical, contents);
  });
}

function initFooterLineSorting() {
  document.querySelectorAll('[data-footer-col-id]').forEach(col => {
    const lines = [...col.querySelectorAll('[data-text-id]')]
      .filter(n => FOOTER_LINE_RE.test(n.dataset.textId));
    lines.forEach(decorateFooterLine);
    if (!lines.length) return;
    if (!col.dataset.dndLines) {
      col.dataset.dndLines = '1';
      makeSortable({
        container: col,
        itemSelector: '.footer-line',
        onReorder: () => commitFooterLineOrder(col),
      });
    }
    if (!col.querySelector(':scope > .footer-line-add')) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'footer-line-add';
      add.textContent = '+';
      add.title = 'Add line';
      add.addEventListener('click', () => {
        const fresh = footerGroup(lines[0]).lines;
        // an empty slot is already an invitation — reuse it first
        const empty = fresh.find(n => !lineText(n));
        if (empty) startEditing(empty);
        else insertFooterLineAfter(fresh[fresh.length - 1]);
      });
      col.append(add);
    }
    pruneBlankFooterLines(col);
    placeFooterAddButton(col);
  });
}

/* ── Bullet reordering inside role cards ─────────────────────── */

function decorateBullets(name) {
  const { container } = pageState[name];
  container.querySelectorAll('ul.timeline-bullets').forEach(ul => {
    ul.querySelectorAll(':scope > li').forEach(li => {
      if (!li.querySelector(':scope > .drag-handle')) {
        li.append(createHandle('Drag to reorder'));
      }
    });
    if (ul.dataset.dndReady) return;
    ul.dataset.dndReady = '1';
    makeSortable({
      container: ul,
      itemSelector: 'li',
      onReorder: () => commitBulletOrder(name, ul),
    });
  });
}

function commitBulletOrder(name, ul) {
  const entityId = ul.closest('[data-entity-id]')?.dataset.entityId;
  const entity = entityId ? findEntity(name, entityId) : null;
  if (!entity) return;
  snapshotCollection(name);
  const order = [...ul.querySelectorAll(':scope > li')]
    .map(li => Number(li.dataset.field.split('.')[1]));
  entity.fields.bullets = order.map(i => entity.fields.bullets[i]);
  store.saveCollection(name, pageState[name].items);
  rerender(name);
}

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
  const html = cleanHTML(node); // admin chrome must never reach the store
  if (prev === html) return; // nothing changed

  snapshotCollection(name);
  if (isBullet) {
    entity.fields.bullets[Number(field.split('.')[1])] = html;
  } else {
    entity.fields[field] = html;
  }
  store.saveCollection(name, pageState[name].items);
  // period drives the computed tenure line — re-render to refresh it
  if (field === 'period') rerender(name);
}

function commitText(node, prevHtml) {
  const html = cleanHTML(node);
  if (prevHtml === html) return; // nothing changed
  pushUndo({ kind: 'text', textId: node.dataset.textId, prevHtml });
  const page = currentPage();
  const texts = store.loadTexts(page);
  texts[node.dataset.textId] = html;
  store.saveTexts(page, texts);
}

/* Pasting rich text keeps only the plain characters — clipboard HTML
   can smuggle in list markup that renders as a bullet nobody can edit. */
function onPastePlain(ev) {
  ev.preventDefault();
  const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

function startEditing(node) {
  // handles are admin chrome — pull them out of the editable surface
  node.querySelectorAll(':scope > .drag-handle').forEach(h => h.remove());
  node.classList.remove('is-blank'); // full height while typing
  const prevHtml = node.innerHTML; // for undo of text edits
  node.contentEditable = 'true';
  node.addEventListener('paste', onPastePlain);
  node.focus();

  const stop = () => {
    node.contentEditable = 'false';
    node.removeEventListener('blur', stop);
    node.removeEventListener('keydown', onKey);
    node.removeEventListener('paste', onPastePlain);
    if (node.dataset.field !== undefined) {
      commitField(node);
      const ctx = bulletContext(node);
      if (ctx && !node.textContent.trim()) removeBullet(ctx);
      else if (ctx) decorateBullets(ctx.name); // give the handle back
      if (node.dataset.field === 'outro' && !node.textContent.trim()) removeOutro(node);
    } else if (node.dataset.textId !== undefined) {
      commitText(node, prevHtml);
      if (isFooterLine(node)) {
        const col = node.closest('[data-footer-col-id]');
        if (!node.textContent.trim()) removeFooterLine(node);
        else decorateFooterLine(node); // give the handle back
        // a line just gained or lost content — clean up scratch slots
        // left blank, then the "+" follows to the new last filled line
        pruneBlankFooterLines(col);
        placeFooterAddButton(col);
      }
    }
  };
  const onKey = ev => {
    if (ev.key === 'Escape') node.blur();
    if (ev.key === 'Enter' && node.dataset.field?.startsWith('bullets.')) {
      ev.preventDefault();
      const ctx = bulletContext(node);
      const hasText = !!node.textContent.trim();
      node.blur(); // commits the current bullet (or removes it when emptied)
      if (!ctx) return;
      if (ev.shiftKey) startOutro(ctx);       // Shift+Enter → closing line, no marker
      else if (hasText) insertBulletAfter(ctx);
    } else if (ev.key === 'Enter' && !ev.shiftKey && node.dataset.field === 'outro') {
      ev.preventDefault();
      node.blur(); // Enter finishes the outro
    } else if (ev.key === 'Enter' && isFooterLine(node)) {
      ev.preventDefault();
      const hasText = !!node.textContent.trim();
      node.blur(); // commits (or removes, when emptied)
      if (hasText) insertFooterLineAfter(node);
    }
  };

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
    if (!node.querySelector(':scope > .entity-delete')) {
      const btn = document.createElement('button');
      btn.className = 'entity-delete';
      btn.setAttribute('aria-label', 'Delete');
      btn.textContent = '×';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteEntity(name, node.dataset.entityId);
      });
      node.append(btn, createHandle('Drag to reorder'));
    }

    if (name === 'roles' && !node.querySelector(':scope > .entity-gradcap-toggle')) {
      const capBtn = document.createElement('button');
      capBtn.className = 'entity-gradcap-toggle';
      capBtn.setAttribute('aria-label', 'Toggle Graduation Cap');
      capBtn.title = 'Toggle Graduation Cap (Red Diploma)';
      capBtn.textContent = '🎓';

      const entity = findEntity('roles', node.dataset.entityId);
      if (entity?.fields?.gradCap) capBtn.classList.add('is-active');

      capBtn.addEventListener('click', e => {
        e.stopPropagation();
        const ent = findEntity('roles', node.dataset.entityId);
        if (!ent) return;
        snapshotCollection('roles');
        ent.fields.gradCap = !ent.fields.gradCap;
        store.saveCollection('roles', pageState['roles'].items);
        rerender('roles');
      });
      node.append(capBtn);
    }
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
      store.saveBlockOrder(currentPage(), ids);
    },
  });
}

/* Footer columns ([data-footer-col-id]) are sortable in admin mode. */
let lastFooterColOrder = null;

function initFooterColSorting() {
  const cols = [...document.querySelectorAll('[data-footer-col-id]')];
  if (cols.length < 2) return;
  lastFooterColOrder = cols.map(c => c.dataset.footerColId);
  cols.forEach(col => col.append(createHandle('Drag to move column')));
  makeSortable({
    container: cols[0].parentNode,
    itemSelector: '[data-footer-col-id]',
    onReorder() {
      const ids = [...document.querySelectorAll('[data-footer-col-id]')]
        .map(c => c.dataset.footerColId);
      pushUndo({ kind: 'footerCols', order: lastFooterColOrder });
      lastFooterColOrder = ids;
      store.saveFooterColOrder(currentPage(), ids);
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
  decorateBullets(name);
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
  initFooterLineSorting(); // decorate any lines the new persona brought in
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
    <button class="admin-publish" title="Commit drafts to GitHub — visible to everyone in ~1 min">Publish</button>
    <button class="admin-pdf" title="Print / save the active persona as PDF (Cmd+P)">Save PDF</button>
    <button class="admin-reset" title="Discard local drafts, back to published content">Reset</button>
    <button class="admin-exit" title="Leave admin entirely (return via ?admin=on)">Log out</button>
  `;
  bar.querySelector('.admin-toggle').addEventListener('click', () => setEditing(!isEditing()));
  bar.querySelector('.admin-publish').addEventListener('click', publish);
  bar.querySelector('.admin-pdf').addEventListener('click', () => window.print());
  bar.querySelector('.admin-reset').addEventListener('click', () => {
    store.resetAll();
    location.reload();
  });
  bar.querySelector('.admin-exit').addEventListener('click', logout);
  document.body.append(bar);
}

/* ── Publish: commit drafts to data/content.json on GitHub ──── */

const REPO_API = 'https://api.github.com/repos/muramets/muramets.github.io/contents/data/content.json';
const TOKEN_KEY = 'cv.v1.gh-token';

async function publish() {
  const btn = document.querySelector('.admin-publish');

  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = prompt(
      'GitHub token to publish (fine-grained, this repo only, ' +
      'permission "Contents: read & write"). Stored in this browser.');
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token.trim());
    token = token.trim();
  }

  btn.textContent = 'Publishing…';
  btn.disabled = true;

  try {
    const headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    };
    const current = await fetch(REPO_API, { headers }).then(r => r.ok ? r.json() : null);

    const body = JSON.stringify(store.exportSnapshot(), null, 2) + '\n';
    const res = await fetch(REPO_API, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Publish content from admin',
        content: btoa(unescape(encodeURIComponent(body))),
        ...(current?.sha ? { sha: current.sha } : {}),
      }),
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem(TOKEN_KEY); // bad token — ask again next time
      throw new Error('token rejected (' + res.status + ')');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    btn.textContent = 'Published ✓';
  } catch (err) {
    console.error('[publish]', err);
    btn.textContent = 'Failed — retry';
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = 'Publish'; }, 4000);
  }
}

/* ── Entry point ───────────────────────────────────────────── */

/* Heal bullets that already swallowed list markup from an old paste:
   each embedded <li> becomes its own bullet, wrappers are flattened. */
function normalizeBullets(entity) {
  const src = entity.fields?.bullets;
  if (!src || !src.some(h => /<(li|ul|ol)[\s>]/i.test(h))) return false;
  const out = [];
  src.forEach(html => {
    if (!/<(li|ul|ol)[\s>]/i.test(html)) { out.push(html); return; }
    const box = document.createElement('div');
    box.innerHTML = html;
    const lis = [...box.querySelectorAll('li')];
    lis.forEach(li => li.remove());
    const lead = box.textContent.trim();
    if (lead) out.push(lead);
    lis.forEach(li => {
      const text = li.textContent.trim();
      if (text) out.push(text);
    });
  });
  entity.fields.bullets = out.length ? out : [''];
  return true;
}

export function initAdmin(state) {
  pageState = state;
  document.body.classList.add('admin-authed');
  document.addEventListener('dblclick', onDblClick);
  document.addEventListener('click', onClickGuard, true);
  document.addEventListener('keydown', onUndoKey);
  Object.keys(pageState).forEach(name => {
    const healed = pageState[name].items.filter(normalizeBullets);
    if (healed.length) {
      store.saveCollection(name, pageState[name].items);
      renderCollection(pageState[name].container, pageState[name].items);
    }
    decorateEntities(name);
    decorateBullets(name);
    makeSortable({
      container: pageState[name].container,
      itemSelector: '[data-entity-id]',
      onReorder: () => commitEntityOrder(name),
    });
  });
  initFooterLineSorting();
  initBlockSorting();
  initFooterColSorting();
  injectAddButtons();
  injectVariantBar();
  injectToolbar();
  setEditing(isEditing());
}

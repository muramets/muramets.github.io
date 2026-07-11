// Generic drag-and-drop sorting. Works for any container whose children
// match itemSelector — entity tiles, timeline items, whole page blocks.
// Dragging starts only from a .drag-handle, so contenteditable text
// selection inside items keeps working.

export function makeSortable({ container, itemSelector, onReorder }) {
  let dragged = null;

  container.addEventListener('mousedown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const item = handle.closest(itemSelector);
    if (item) item.draggable = true;
  });

  container.addEventListener('dragstart', e => {
    const item = e.target.closest?.(itemSelector);
    if (!item || !item.draggable) return;
    dragged = item;
    dragged.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch { /* IE quirk */ }
  });

  container.addEventListener('dragover', e => {
    if (!dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const over = e.target.closest?.(itemSelector);
    if (!over || over === dragged || over.parentNode !== dragged.parentNode) return;

    // Same visual row (grids) → decide by X, otherwise by Y.
    const rect = over.getBoundingClientRect();
    const dragRect = dragged.getBoundingClientRect();
    const sameRow = Math.abs(rect.top - dragRect.top) < rect.height / 2;
    const before = sameRow
      ? e.clientX < rect.left + rect.width / 2
      : e.clientY < rect.top + rect.height / 2;

    const ref = before ? over : over.nextSibling;
    if (ref === dragged || dragged.nextSibling === ref) return; // already in place

    // FLIP: siblings glide to their new spots in real time
    flipMove(dragged.parentNode, itemSelector, () =>
      over.parentNode.insertBefore(dragged, ref));
  });

  container.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged.draggable = false;
    dragged = null;
    onReorder();
  });
}

/* FLIP animation: capture positions, mutate DOM, then animate every
   displaced sibling from its old position to the new one. */
function flipMove(parent, itemSelector, mutate) {
  const els = [...parent.querySelectorAll(':scope > ' + itemSelector)];
  const firstRects = new Map(els.map(el => [el, el.getBoundingClientRect()]));

  mutate();

  els.forEach(el => {
    if (el.classList.contains('is-dragging')) return; // browser ghosts this one
    const first = firstRects.get(el);
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 180ms ease';
      el.style.transform = '';
      el.addEventListener('transitionend', () => {
        el.style.transition = '';
      }, { once: true });
    });
  });
}

/** Create the hover grip button used by all sortable items. */
export function createHandle(title) {
  const handle = document.createElement('button');
  handle.className = 'drag-handle';
  handle.setAttribute('aria-label', title);
  handle.title = title;
  handle.textContent = '⠿';
  return handle;
}

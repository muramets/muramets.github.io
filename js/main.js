// Bootstrap: remote content → auth → texts → collections →
// (admin UI if authorized).

import { initAuth, isAdmin, login, logout } from './auth.js?v=31';
import { initStore } from './store.js?v=31';
import { renderPage, applyTexts, applyBlockOrder, pruneEmptyNav } from './render.js?v=31';

// Cold load has no inbound view transition (nothing to morph from) —
// give it a one-time entrance fade instead. Navigations between pages
// are handled by the cross-document view transitions in motion.css.
window.addEventListener('pagereveal', e => {
  if (!e.viewTransition) document.documentElement.classList.add('is-first-load');
});

// Cmd/Ctrl+Shift+A toggles admin mode (same effect as ?admin=on/off)
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyA') {
    e.preventDefault();
    isAdmin() ? logout() : login();
  }
});

await initStore(); // published content must be in place before render

initAuth();
applyTexts();
applyBlockOrder();
const state = renderPage();

if (isAdmin()) {
  const { initAdmin } = await import('./admin.js?v=31');
  initAdmin(state);
} else {
  pruneEmptyNav(); // hide links to pages that have nothing on them yet
  initDeckToggle();
  initTimelineCollapse();
}

/* Professional Journey: visitors get the three most recent roles; the
   earlier ones wait behind a fade and one button press. Expanding
   animates the list height and staggers the incoming cards; the same
   button then collapses back to recent-only. */
function initTimelineCollapse() {
  const list = document.querySelector('.timeline-list');
  if (!list || list.querySelectorAll('[data-entity-id]').length <= 3) return;

  list.classList.add('is-collapsed');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'timeline-expand';
  btn.textContent = 'Earlier timeline ↓';
  list.after(btn);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function runHeight(from, to, done) {
    list.style.height = from + 'px';
    list.style.overflow = 'hidden';
    void list.offsetHeight; // flush, so the next height change transitions
    list.style.transition = 'height 500ms ease';
    list.style.height = to + 'px';
    list.addEventListener('transitionend', function clear(e) {
      if (e.propertyName !== 'height') return;
      list.removeEventListener('transitionend', clear);
      list.style.height = list.style.overflow = list.style.transition = '';
      done?.();
    });
  }

  function expand() {
    const from = list.offsetHeight;
    list.classList.remove('is-collapsed');
    if (reduced) return;
    runHeight(from, list.offsetHeight);
    list.querySelectorAll('.timeline-item:nth-child(n+4)').forEach((item, i) => {
      item.classList.add('is-revealing');
      item.style.animationDelay = i * 70 + 'ms';
      item.addEventListener('animationend', () => {
        item.classList.remove('is-revealing');
        item.style.animationDelay = '';
      }, { once: true });
    });
  }

  function backToSection() {
    if (list.getBoundingClientRect().top < 0) {
      list.closest('.section')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }
  }

  function collapse() {
    const from = list.offsetHeight;
    list.classList.add('is-collapsed');
    if (reduced) { backToSection(); return; }
    const to = list.offsetHeight;
    // keep the cards visible while the shrinking container clips them —
    // display:none lands only after the motion is over
    list.classList.remove('is-collapsed');
    list.classList.add('is-collapsing');
    runHeight(from, to, () => {
      list.classList.remove('is-collapsing');
      list.classList.add('is-collapsed');
      backToSection(); // scroll only after the height settles — no tug-of-war
    });
  }

  btn.addEventListener('click', () => {
    const expanding = list.classList.contains('is-collapsed');
    if (expanding) expand(); else collapse();
    btn.textContent = expanding ? 'Recent only ↑' : 'Earlier timeline ↓';
  });
}

/* Past/Present deck rotation — public only (admin sees both panes
   stacked for editing). Auto-flips every 5s, click switches manually,
   hovering the deck pauses the clock. */
function initDeckToggle() {
  const swap = document.querySelector('.deck-swap');
  if (!swap) return;
  const tabs = [...document.querySelectorAll('.deck-toggle [data-deck-tab]')];
  const panes = [...swap.querySelectorAll('[data-deck-pane]')];
  let active = 'past';
  let timer = null;

  function show(id) {
    if (id === active) return;
    active = id;
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.deckTab === id));
    panes.forEach(p => p.classList.toggle('is-active', p.dataset.deckPane === id));
  }
  const flip = () => show(active === 'past' ? 'present' : 'past');
  const start = () => { if (!timer) timer = setInterval(flip, 5000); };
  const pause = () => { clearInterval(timer); timer = null; };

  tabs.forEach(t => t.addEventListener('click', () => {
    pause();
    show(t.dataset.deckTab);
    start(); // manual pick restarts the 5s clock
  }));
  const block = swap.closest('.masthead-deck-block');
  block?.addEventListener('mouseenter', pause);
  block?.addEventListener('mouseleave', start);
  start();
}

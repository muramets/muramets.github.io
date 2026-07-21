// Bootstrap: remote content → auth → texts → collections →
// (admin UI if authorized).

import { initAuth, isAdmin, login, logout } from './auth.js?v=26';
import { initStore } from './store.js?v=26';
import { renderPage, applyTexts, applyBlockOrder, pruneEmptyNav } from './render.js?v=26';

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
  const { initAdmin } = await import('./admin.js?v=26');
  initAdmin(state);
} else {
  pruneEmptyNav(); // hide links to pages that have nothing on them yet
  initDeckToggle();
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

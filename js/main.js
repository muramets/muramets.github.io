// Bootstrap: auth → texts → collections → (admin UI if authorized).

import { initAuth, isAdmin } from './auth.js?v=11';
import { renderPage, applyTexts, applyBlockOrder } from './render.js?v=11';

// Cold load has no inbound view transition (nothing to morph from) —
// give it a one-time entrance fade instead. Navigations between pages
// are handled by the cross-document view transitions in motion.css.
window.addEventListener('pagereveal', e => {
  if (!e.viewTransition) document.documentElement.classList.add('is-first-load');
});

initAuth();
applyTexts();
applyBlockOrder();
const state = renderPage();

if (isAdmin()) {
  const { initAdmin } = await import('./admin.js?v=11');
  initAdmin(state);
}

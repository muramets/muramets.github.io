// Bootstrap: auth → texts → collections → (admin UI if authorized).

import { initAuth, isAdmin } from './auth.js';
import { renderPage, applyTexts } from './render.js';

initAuth();
applyTexts();
const state = renderPage();

if (isAdmin()) {
  const { initAdmin } = await import('./admin.js');
  initAdmin(state);
}

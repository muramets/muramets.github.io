// Admin gate. MVP: flag in localStorage, toggled via URL (?admin=on / ?admin=off).
// The rest of the app only ever calls isAdmin() — swapping this module for a
// real backend session (cookie/JWT check) requires no changes elsewhere.

const ADMIN_KEY = 'cv.v1.admin';

export function initAuth() {
  const params = new URLSearchParams(location.search);
  if (params.has('admin')) {
    const value = params.get('admin');
    if (value === 'off' || value === '0') {
      localStorage.removeItem(ADMIN_KEY);
    } else {
      localStorage.setItem(ADMIN_KEY, '1');
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }
}

export function isAdmin() {
  return localStorage.getItem(ADMIN_KEY) === '1';
}

export function logout() {
  localStorage.removeItem(ADMIN_KEY);
  location.reload();
}

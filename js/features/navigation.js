// Header, navigation and section navigation controls.

export function initLinkedInModal() {
  let overlay = null;

  const createModal = targetUrl => {
    overlay = document.createElement('div');
    overlay.className = 'external-modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="external-modal" role="dialog" aria-modal="true" aria-labelledby="ext-modal-title">
        <span class="external-modal-kicker">External Link · LinkedIn</span>
        <h3 class="external-modal-title" id="ext-modal-title">You're going to shift your focus</h3>
        <p class="external-modal-text">You are about to be redirected to LinkedIn profile:<br><span class="external-modal-url">${targetUrl}</span></p>
        <div class="external-modal-actions">
          <button type="button" class="external-modal-btn-cancel">Cancel</button>
          <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="external-modal-btn-confirm">Continue to LinkedIn &rarr;</a>
        </div>
      </div>
    `;
    document.body.append(overlay);

    const cancelBtn = overlay.querySelector('.external-modal-btn-cancel');
    const confirmBtn = overlay.querySelector('.external-modal-btn-confirm');

    const close = () => {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    };

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    confirmBtn.addEventListener('click', close);
  };

  document.addEventListener('click', e => {
    if (e.target.closest('.external-modal')) return;
    const link = e.target.closest('a[href*="linkedin.com"]');
    if (!link) return;
    e.preventDefault();
    const targetUrl = link.getAttribute('href') || 'https://www.linkedin.com/in/muramets/';
    if (!overlay) {
      createModal(targetUrl);
    } else {
      const urlSpan = overlay.querySelector('.external-modal-url');
      const confirmBtn = overlay.querySelector('.external-modal-btn-confirm');
      if (urlSpan) urlSpan.textContent = targetUrl;
      if (confirmBtn) confirmBtn.href = targetUrl;
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  });
}

export function placeKickerInNav() {
  const kicker = document.querySelector('.masthead-kicker');
  const vnav = document.querySelector('.vnav');
  if (kicker && vnav && !vnav.contains(kicker)) {
    vnav.prepend(kicker);
  }
}

/* Mobile: the status label (COOKING… / Available for Collab) moves from
   the meta row into the hero row — between the wordmark and the avatar.
   Desktop keeps the original meta-row position. The node MOVES (never
   duplicates), so admin editing and applyTexts keep a single source. */
export function placeStatusForMobile() {
  const status = document.querySelector('.masthead-date');
  const metaRow = document.querySelector('.masthead-meta-row');
  const heroRow = document.querySelector('.masthead-hero-row');
  if (!status || !metaRow || !heroRow) return;
  const avatar = heroRow.querySelector('.masthead-avatar-wrap');
  const mq = matchMedia('(max-width: 650px)');
  const apply = () => {
    if (mq.matches) {
      heroRow.insertBefore(status, avatar ?? null);
    } else if (avatar) {
      avatar.prepend(status);
    } else {
      metaRow.append(status);
    }
  };
  mq.addEventListener('change', apply);
  apply();
}

/* ── Mobile: burger + slide-in drawer (all pages) ─────────────
   The drawer is built from the live .vnav list — after pruneEmptyNav,
   so visitors never see links to empty pages. Verge-style: ultraviolet
   panel from the right, dimmed overlay, staggered links, watermark. */
export function initMobileNav() {
  const vnav = document.querySelector('.vnav');
  const list = vnav?.querySelector('ul');
  if (!vnav || !list) return;

  const burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'nav-burger';
  burger.setAttribute('aria-label', 'Open menu');
  burger.innerHTML = '<span></span><span></span><span></span>';
  vnav.append(burger);

  const overlay = document.createElement('div');
  overlay.className = 'nav-overlay';

  const drawer = document.createElement('aside');
  drawer.className = 'nav-drawer';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nav-drawer-close';
  close.innerHTML = 'close <span aria-hidden="true">✕</span>';

  const links = document.createElement('nav');
  links.className = 'nav-drawer-links';
  list.querySelectorAll('a').forEach((a, i) => {
    const link = a.cloneNode(true);
    link.classList.add('drawer-link');
    link.style.transitionDelay = 60 + i * 50 + 'ms'; // staggered entrance
    links.append(link);
  });

  const cta = document.createElement('a');
  cta.className = 'drawer-cta';
  cta.href = 'mailto:muramets007@icloud.com';
  cta.textContent = 'Email Me';

  const telegramCta = document.createElement('a');
  telegramCta.className = 'drawer-cta-icon';
  telegramCta.href = 'https://t.me/muramets';
  telegramCta.target = '_blank';
  telegramCta.rel = 'noopener noreferrer';
  telegramCta.setAttribute('aria-label', 'Message me on Telegram');
  telegramCta.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-2 1.94c-.24.24-.44.44-.82.44z"/></svg>';

  const ctaRow = document.createElement('div');
  ctaRow.className = 'drawer-cta-row';
  ctaRow.append(cta, telegramCta);

  const mark = document.createElement('div');
  mark.className = 'drawer-watermark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'ILIA BLINOV';

  drawer.append(close, links, ctaRow, mark);
  document.body.append(overlay, drawer);

  const open = () => {
    document.documentElement.classList.add('drawer-open');
    overlay.classList.add('is-open');
    drawer.classList.add('is-open');
  };
  const shut = () => {
    document.documentElement.classList.remove('drawer-open');
    overlay.classList.remove('is-open');
    drawer.classList.remove('is-open');
  };
  burger.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', shut);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });
}

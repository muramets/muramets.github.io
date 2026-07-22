// Bootstrap: remote content → auth → texts → collections →
// (admin UI if authorized).

import { initAuth, isAdmin, login, logout } from './auth.js?v=42';
import { initStore } from './store.js?v=42';
import { renderPage, applyTexts, applyBlockOrder, applyFooterColOrder, pruneEmptyNav } from './render.js?v=42';

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
applyFooterColOrder();
const state = renderPage();

if (isAdmin()) {
  const { initAdmin } = await import('./admin.js?v=42');
  initAdmin(state);
} else {
  pruneEmptyNav(); // hide links to pages that have nothing on them yet
  initDeckToggle();
  initTimelineCollapse();
}
initContactForm();
initMobileNav();
initSectionBar();
placeStatusForMobile();
placeKickerInNav();
initLinkedInModal();
initLenisScroll();

function initLinkedInModal() {
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

function placeKickerInNav() {
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
function placeStatusForMobile() {
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
function initMobileNav() {
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

  const mark = document.createElement('div');
  mark.className = 'drawer-watermark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'ILIA BLINOV';

  drawer.append(close, links, cta, mark);
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

/* ── Mobile: floating section bar (main page only) ────────────
   Verge-style frosted pill pinned to the viewport top. Built from the
   page's [data-block-id] sections; labels come from the ribbon text
   ("Section 01 / Impact" → "Impact"). Scrollspy highlights the section
   in view; tapping glides to it. Pages with one section get no bar. */
function initSectionBar() {
  const sections = [...document.querySelectorAll('[data-block-id]')];
  if (sections.length < 2) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bar = document.createElement('nav');
  bar.className = 'section-bar';
  bar.setAttribute('aria-label', 'Page sections');

  const tabs = new Map();
  sections.forEach(section => {
    const label = section.querySelector('.section-ribbon')
      ?.textContent.split('/').pop().trim() || section.dataset.blockId;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'section-bar-tab';
    tab.textContent = label;
    tab.addEventListener('click', () =>
      section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
    tabs.set(section, tab);
    bar.append(tab);
  });

  document.body.append(bar);

  // Show floating bar reliably whenever scroll passes the site header into section content
  const header = document.querySelector('.site-header');
  const checkVisibility = () => {
    const headerThreshold = (header?.offsetHeight || 180) - 50;
    const isPastHeader = window.scrollY > headerThreshold;
    bar.classList.toggle('is-visible', isPastHeader);
  };

  window.addEventListener('scroll', checkVisibility, { passive: true });
  checkVisibility();

  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      tabs.forEach(tab => tab.classList.remove('is-active'));
      tabs.get(entry.target)?.classList.add('is-active');
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach(section => spy.observe(section));
  tabs.values().next().value?.classList.add('is-active');
}

// Prevent browser scroll restoration jumps during dynamic JS hydration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Smooth scroll handler for anchor links
let lenisInstance = null;

function initLenisScroll() {
  if (typeof Lenis === 'undefined') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  lenisInstance = new Lenis({
    autoRaf: true,
    lerp: 0.08,
    smoothWheel: true,
    wheelMultiplier: 0.9,
    smoothTouch: false,
    syncTouch: false,
  });
}

// Smooth scroll handler for anchor links with Lenis integration
document.addEventListener('click', e => {
  if (e.target.closest('.external-modal')) return;
  const anchor = e.target.closest('a[href^="#"]');
  if (!anchor) return;
  const targetId = anchor.getAttribute('href').slice(1);
  if (!targetId) return;
  if (targetId === 'top') {
    e.preventDefault();
    if (lenisInstance) {
      lenisInstance.scrollTo(0, { duration: 1.2 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    e.preventDefault();
    if (lenisInstance) {
      lenisInstance.scrollTo(targetEl, { duration: 1.2, offset: -24 });
    } else {
      targetEl.scrollIntoView({ behavior: 'smooth' });
    }
    history.pushState(null, '', `#${targetId}`);
  }
});

/* Professional Journey: visitors get the three most recent roles; the
   earlier ones wait behind a fade and expand by 3 cards at a time.
   Button text progresses: "Earlier timeline ↓" → "Another life ↓" → "Recent only ↑".
   Collapsing uses a non-destructive dual-motion animation to fold the list and
   bring Get in Touch into focus seamlessly. */
function initTimelineCollapse() {
  const list = document.querySelector('.timeline-list');
  const items = list ? Array.from(list.querySelectorAll('.timeline-item')) : [];
  if (!list || items.length <= 3) return;

  let visibleCount = 3;

  function updateVisibility() {
    items.forEach((item, index) => {
      item.style.display = index < visibleCount ? '' : 'none';
    });
    list.classList.toggle('has-fade', visibleCount < items.length);
  }

  // Initial state: show first 3 items with bottom fade
  updateVisibility();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'timeline-expand';
  btn.textContent = 'Earlier timeline ↓';
  list.after(btn);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function getButtonText(count) {
    if (count >= items.length) return 'Recent only ↑';
    if (count > 3) return 'Another life ↓';
    return 'Earlier timeline ↓';
  }

  function swapButtonText(newText) {
    if (btn.textContent === newText) return;
    if (reduced) { btn.textContent = newText; return; }

    btn.classList.add('is-swapping');
    setTimeout(() => {
      btn.textContent = newText;
      btn.classList.remove('is-swapping');
      btn.classList.add('is-swapped-pulse');
      setTimeout(() => btn.classList.remove('is-swapped-pulse'), 300);
    }, 150);
  }

  function runHeight(from, to, done) {
    list.style.height = from + 'px';
    list.style.overflow = 'hidden';
    void list.offsetHeight; // flush, so the next height change transitions
    list.style.transition = 'height 500ms cubic-bezier(0.4, 0, 0.2, 1)';
    list.style.height = to + 'px';
    list.addEventListener('transitionend', function clear(e) {
      if (e.propertyName !== 'height') return;
      list.removeEventListener('transitionend', clear);
      list.style.height = list.style.overflow = list.style.transition = '';
      done?.();
    });
  }

  function expandNext() {
    const from = list.offsetHeight;
    const prevCount = visibleCount;
    visibleCount = Math.min(items.length, visibleCount + 3);

    const FADE_H = 140; // keep in sync with .timeline-list.has-fade::after
    const unseenTopViewport = list.getBoundingClientRect().bottom - FADE_H;

    for (let i = prevCount; i < visibleCount; i++) {
      if (items[i]) items[i].style.display = '';
    }
    list.classList.toggle('has-fade', visibleCount < items.length);

    const to = list.offsetHeight;

    if (!reduced) {
      document.documentElement.style.overflowAnchor = 'none';

      const startScrollY = window.scrollY;
      const targetScrollY = Math.max(0, startScrollY + unseenTopViewport - 100);

      const duration = 500;
      const startTime = performance.now();
      list.style.overflow = 'hidden';

      for (let i = prevCount; i < visibleCount; i++) {
        const item = items[i];
        if (!item) continue;
        item.classList.add('is-revealing');
        item.style.animationDelay = (i - prevCount) * 70 + 'ms';
        item.addEventListener('animationend', () => {
          item.classList.remove('is-revealing');
          item.style.animationDelay = '';
        }, { once: true });
      }

      function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 3);

        const currentH = from + (to - from) * ease;
        list.style.height = currentH + 'px';

        if (Math.abs(targetScrollY - startScrollY) > 2) {
          window.scrollTo(0, startScrollY + (targetScrollY - startScrollY) * ease);
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          list.style.height = list.style.overflow = '';
          document.documentElement.style.overflowAnchor = '';
        }
      }

      requestAnimationFrame(animate);
    }

    swapButtonText(getButtonText(visibleCount));
  }

  function collapseToRecent() {
    const from = list.offsetHeight;
    const thirdItem = items[2];

    const listRect = list.getBoundingClientRect();
    const thirdRect = thirdItem.getBoundingClientRect();
    const to = Math.round(thirdRect.bottom - listRect.top);

    list.classList.add('has-fade');
    swapButtonText(getButtonText(3));

    const contactEl = document.getElementById('contact');

    if (reduced) {
      visibleCount = 3;
      updateVisibility();
      (contactEl || btn).scrollIntoView({ behavior: 'auto' });
      return;
    }

    document.documentElement.style.overflowAnchor = 'none';

    const startScrollY = window.scrollY;
    const deltaH = from - to;

    const contactRect = contactEl ? contactEl.getBoundingClientRect() : null;
    const targetScrollY = contactRect
      ? Math.max(0, startScrollY + contactRect.top - deltaH - 40)
      : startScrollY;

    const duration = 500;
    const startTime = performance.now();
    list.style.overflow = 'hidden';

    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentH = from + (to - from) * ease;
      list.style.height = currentH + 'px';

      if (Math.abs(targetScrollY - startScrollY) > 2) {
        window.scrollTo(0, startScrollY + (targetScrollY - startScrollY) * ease);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        visibleCount = 3;
        updateVisibility();
        list.style.height = list.style.overflow = '';
        document.documentElement.style.overflowAnchor = '';
      }
    }

    requestAnimationFrame(animate);
  }

  btn.addEventListener('click', () => {
    if (visibleCount >= items.length) {
      collapseToRecent();
    } else {
      expandNext();
    }
  });
}

/* Past/Present deck rotation — public only (admin sees both panes
   stacked for editing). Auto-flips every 10s (2x slower), click switches manually,
   hovering the deck or text freezes auto-rotation cross-browser (including Safari). */
function initDeckToggle() {
  const swap = document.querySelector('.deck-swap');
  if (!swap) return;
  const tabs = [...document.querySelectorAll('.deck-toggle [data-deck-tab]')];
  const panes = [...swap.querySelectorAll('[data-deck-pane]')];
  const block = swap.closest('.masthead-deck-block') || swap;
  let active = 'past';
  let timer = null;
  let isHovered = false;

  function show(id) {
    if (id === active) return;
    active = id;
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.deckTab === id));
    panes.forEach(p => p.classList.toggle('is-active', p.dataset.deckPane === id));
  }

  function isUserHovering() {
    if (isHovered) return true;
    try {
      return Boolean(block && block.matches && block.matches(':hover'));
    } catch (_) {
      return false;
    }
  }

  const flip = () => {
    if (isUserHovering()) return;
    show(active === 'past' ? 'present' : 'past');
  };

  const start = () => {
    if (!timer) timer = setInterval(flip, 10000);
  };
  const pause = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const onEnter = () => {
    isHovered = true;
    pause();
  };
  const onLeave = () => {
    isHovered = false;
    pause();
    start();
  };

  tabs.forEach(t => t.addEventListener('click', () => {
    pause();
    show(t.dataset.deckTab);
    if (!isUserHovering()) start();
  }));

  if (block) {
    block.addEventListener('mouseenter', onEnter);
    block.addEventListener('mouseleave', onLeave);
    block.addEventListener('pointerenter', onEnter);
    block.addEventListener('pointerleave', onLeave);
  }

  start();
}

/* Floating Toast notification — admin toolbar style next to submit button */
export function showToast(message, duration = 5000, container = null) {
  document.querySelectorAll('.site-toast').forEach(t => t.remove());

  const targetContainer = container || document.querySelector('.form-submit-row') || document.body;

  const toast = document.createElement('div');
  toast.className = 'site-toast';

  const dot = document.createElement('span');
  dot.className = 'site-toast-dot';

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(text);
  targetContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* Contact Form handling — no browser alert popup, custom inline field validation */
function initContactForm() {
  const form = document.getElementById('contact-form') || document.querySelector('.form-stack');
  if (!form) return;

  function clearErrors() {
    form.querySelectorAll('.form-input').forEach(input => input.classList.remove('is-invalid'));
    form.querySelectorAll('.form-error-msg').forEach(msg => msg.remove());
  }

  function showError(input, message) {
    if (!input) return;
    input.classList.add('is-invalid');
    const parent = input.closest('.form-field') || input.parentElement;
    if (parent && !parent.querySelector('.form-error-msg')) {
      const err = document.createElement('span');
      err.className = 'form-error-msg';
      err.textContent = message;
      parent.appendChild(err);
    }
  }

  // Clear error state live on user input
  form.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      const parent = input.closest('.form-field') || input.parentElement;
      parent?.querySelector('.form-error-msg')?.remove();
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();

    const btn = form.querySelector('button[type="submit"]');
    const nameInput = form.querySelector('#name');
    const emailInput = form.querySelector('#email');
    const msgInput = form.querySelector('#message');

    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const message = msgInput?.value.trim() || '';

    let hasError = false;
    let firstInvalidInput = null;

    if (!name) {
      showError(nameInput, 'Please fill in your name.');
      hasError = true;
      if (!firstInvalidInput) firstInvalidInput = nameInput;
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!email) {
      showError(emailInput, 'Please fill in your email address.');
      hasError = true;
      if (!firstInvalidInput) firstInvalidInput = emailInput;
    } else if (!emailRegex.test(email)) {
      showError(emailInput, 'Please enter a valid email address.');
      hasError = true;
      if (!firstInvalidInput) firstInvalidInput = emailInput;
    }

    if (!message) {
      showError(msgInput, 'Please enter project details.');
      hasError = true;
      if (!firstInvalidInput) firstInvalidInput = msgInput;
    }

    if (hasError) {
      firstInvalidInput?.focus();
      return;
    }

    const originalText = btn ? btn.textContent : 'Send Message';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }

    const endpoint = form.dataset.formspreeUrl;
    if (endpoint) {
      try {
        const formData = new FormData(form);
        const res = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          if (btn) btn.textContent = originalText;
          form.reset();
          showToast("Message sent! Thank you, I'll get back to you soon.", 5000);
        } else {
          showError(btn?.parentElement, 'Failed to send message. Please try again.');
          if (btn) btn.textContent = originalText;
        }
      } catch (err) {
        showError(btn?.parentElement, 'Connection error. Please try again.');
        if (btn) btn.textContent = originalText;
      } finally {
        if (btn) btn.disabled = false;
      }
    } else {
      const subject = encodeURIComponent(`Contact Form Submission from ${name}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
      window.location.href = `mailto:muramets007@icloud.com?subject=${subject}&body=${body}`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });
}


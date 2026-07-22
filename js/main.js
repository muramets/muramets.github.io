// Bootstrap: remote content → auth → texts → collections →
// (admin UI if authorized).

import { initAuth, isAdmin, login, logout } from './auth.js?v=42';
import { initStore } from './store.js?v=42';
import { renderPage, applyTexts, applyBlockOrder, applyFooterColOrder, pruneEmptyNav } from './render.js?v=45';

let lenisInstance = null;
const ANCHOR_SCROLL_DURATION = 1.28;
const isWebKitSafari = /Safari\//.test(navigator.userAgent)
  && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/.test(navigator.userAgent);
document.documentElement.classList.toggle('is-webkit-safari', isWebKitSafari);

// A reload should always restart the editorial path at the masthead. Safari
// otherwise restores its last scroll offset after the module has evaluated.
// This is limited to reloads, so anchors and Back/Forward history keep their
// expected positions.
const navigationEntry = performance.getEntriesByType('navigation')[0];
if (navigationEntry?.type === 'reload') {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const resetReloadScroll = () => {
    let framesRemaining = 2;
    const enforceHeader = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (framesRemaining-- > 0) requestAnimationFrame(enforceHeader);
    };
    enforceHeader();
  };
  resetReloadScroll();
  window.addEventListener('pageshow', resetReloadScroll, { once: true });
}
// Zero velocity at both ends: an anchor is approached and released rather
// than caught. It keeps long travel fluid without a hard arrival frame.
const anchorScrollEasing = t => 0.5 - Math.cos(Math.PI * t) / 2;

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
  initJourneyExplorerGlow();
}
initContactForm();
initMobileNav();
initSectionBar();
placeStatusForMobile();
placeKickerInNav();
initLinkedInModal();
const scrollInteraction = initScrollInteractionFeedback();
initLenisScroll(scrollInteraction);

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
  const getSectionViewportTarget = section => {
    const floatingInset = Math.max(96, (bar.offsetHeight || 0) + 28);

    if (section.id === 'achievements') {
      const chapter = section.querySelector('.scroll-chapter--impact');
      if (chapter) {
        const chapterTop = window.scrollY + chapter.getBoundingClientRect().top;
        // This is the full-viewport, closed-door frame used by Impact itself.
        return Math.max(0, chapterTop - window.innerHeight
          + (chapter.offsetHeight + window.innerHeight) * 0.27);
      }
    }

    const focus = section.id === 'experience'
      ? section.querySelector('.timeline-item')
      : section.querySelector('.section-title') || section;
    return Math.max(0, window.scrollY + focus.getBoundingClientRect().top - floatingInset);
  };

  sections.forEach(section => {
    const label = section.querySelector('.section-ribbon')
      ?.textContent.split('/').pop().trim() || section.dataset.blockId;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'section-bar-tab';
    tab.textContent = label;
    tab.addEventListener('click', () => {
      const target = getSectionViewportTarget(section);
      if (reduced) {
        window.scrollTo({ top: target, behavior: 'auto' });
      } else if (lenisInstance) {
        lenisInstance.scrollTo(target, {
          duration: ANCHOR_SCROLL_DURATION,
          easing: anchorScrollEasing,
        });
      } else {
        window.scrollTo({ top: target, behavior: 'smooth' });
      }
    });
    tabs.set(section, tab);
    bar.append(tab);
  });

  document.body.append(bar);

  // IntersectionObserver makes the bar appear after the header without a
  // scroll listener or layout read on every animation frame.
  const header = document.querySelector('.site-header');
  if (header) {
    const headerObserver = new IntersectionObserver(([entry]) => {
      const isPastHeader = !entry.isIntersecting && entry.boundingClientRect.bottom <= 50;
      bar.classList.toggle('is-visible', isPastHeader);
    }, { rootMargin: '-50px 0px 0px', threshold: 0 });
    headerObserver.observe(header);
  }

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

/* Cards remain genuinely live during a scroll. When the composition travels
   beneath a resting cursor, hit-testing promotes whichever tile reaches that
   point — exactly like direct hover, with no invented "intent" gate. */
function initScrollInteractionFeedback() {
  let lastPointer = null;
  let hoveredTile = null;
  let hoverFrame = null;
  const impactChapter = document.querySelector('.scroll-chapter--impact');
  let impactTop = 0;
  let impactHeight = 0;
  let lastScrollY = window.scrollY;
  let scrollDirection = 0;
  let lastScrollAt = 0;

  const refreshImpactBounds = () => {
    if (!impactChapter) return;
    const rect = impactChapter.getBoundingClientRect();
    impactTop = window.scrollY + rect.top;
    impactHeight = impactChapter.offsetHeight;
  };
  const isImpactActive = () => {
    if (!impactChapter) return false;
    const viewportBottom = window.scrollY + window.innerHeight;
    return viewportBottom >= impactTop - 96 && window.scrollY <= impactTop + impactHeight + 96;
  };
  refreshImpactBounds();
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(refreshImpactBounds);
  }, { passive: true });

  const getImpactProgress = () => {
    if (!impactChapter) return null;
    return (window.scrollY - (impactTop - window.innerHeight))
      / (impactHeight + window.innerHeight);
  };

  const releaseLockedFeaturedHover = () => {
    const featured = document.querySelector('.scroll-chapter__content .story-tile.featured.mint.is-hover-locked');
    if (!featured) return;

    const progress = getImpactProgress();
    if (progress === null) return;
    // The retained visual belongs to the closing pass only. A fully closed
    // door resets it; a new forward pass returns control to normal hover.
    if (progress <= 0.20 || (scrollDirection > 0 && progress > 0.20)) {
      featured.classList.remove('is-hover-locked');
    }
  };

  const resetFeaturedHoverAtClosedDoors = () => {
    const progress = getImpactProgress();
    if (progress === null || progress > 0.272) return;

    const featured = document.querySelector('.scroll-chapter__content .story-tile.featured.mint');
    if (!featured) return;
    featured.classList.remove('is-hover-primed', 'is-hover-locked', 'has-hover-intent');
    if (hoveredTile === featured) hoveredTile = null;
  };

  const lockFeaturedHoverWhileClosing = tile => {
    if (!tile?.matches('.featured.mint.is-hover-primed')) return;
    if (scrollDirection >= 0 || performance.now() - lastScrollAt > 140) return;

    const progress = getImpactProgress();
    if (progress !== null && progress > 0.20) tile.classList.add('is-hover-locked');
  };

  const activateCardHover = tile => {
    if (!tile) return;
    tile.classList.add('has-hover-intent');
    if (tile.matches('.featured.mint')) tile.classList.add('is-hover-primed');
  };

  const syncHoverAtPointer = () => {
    hoverFrame = null;
    if (!isImpactActive()) return;
    const target = lastPointer && document.elementFromPoint(lastPointer.x, lastPointer.y);
    // :hover is evaluated by the browser even when content scrolls under a
    // completely still cursor, so it also covers the first card encounter.
    const nextTile = target?.closest('.story-tile')
      ?? document.querySelector('.scroll-chapter__content .story-tile:hover');
    if (hoveredTile && hoveredTile !== nextTile) {
      lockFeaturedHoverWhileClosing(hoveredTile);
      hoveredTile.classList.remove('has-hover-intent');
    }
    if (nextTile) activateCardHover(nextTile);
    hoveredTile = nextTile;
  };

  const requestHoverSync = () => {
    // The only cards managed here live in Impact. Skipping hit-testing outside
    // that chapter keeps Journey's disclosure animation free of extra work.
    if (!isImpactActive()) return;
    if (hoverFrame !== null) return;
    hoverFrame = requestAnimationFrame(syncHoverAtPointer);
  };

  const isFinePointer = event => event.pointerType === 'mouse' || event.pointerType === 'pen';

  document.addEventListener('pointermove', event => {
    if (!isFinePointer(event)) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    requestHoverSync();
  }, { passive: true });

  document.addEventListener('pointerover', event => {
    if (!isFinePointer(event)) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    requestHoverSync();
  });

  document.addEventListener('pointerout', event => {
    const tile = event.target.closest('.story-tile');
    if (!tile || tile.contains(event.relatedTarget)) return;
    lockFeaturedHoverWhileClosing(tile);
    tile.classList.remove('has-hover-intent');
    if (hoveredTile === tile) hoveredTile = null;
  });

  // Scrolling does not suppress hover: the card arriving below a stationary
  // cursor is intentionally allowed to become the active card.
  window.addEventListener('scroll', () => {
    if (!isImpactActive()) {
      if (hoveredTile) hoveredTile.classList.remove('has-hover-intent');
      hoveredTile = null;
      return;
    }
    const current = window.scrollY;
    if (Math.abs(current - lastScrollY) > 0.5) {
      scrollDirection = current > lastScrollY ? 1 : -1;
      lastScrollAt = performance.now();
    }
    lastScrollY = current;
    releaseLockedFeaturedHover();
    resetFeaturedHoverAtClosedDoors();
    requestHoverSync();
  }, { passive: true });

  return { sync: requestHoverSync };
}

/* One physical scroll curve for the whole site. About's emphasis comes from
   sticky scroll scenes in CSS, not from altering the user's wheel input. */
function initLenisScroll(scrollFeedback) {
  const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (typeof Lenis === 'undefined' || !hasFinePointer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  lenisInstance = new Lenis({
    autoRaf: true,
    // Safari keeps a lighter layer of authored inertia. The expensive part
    // was its scroll-linked transform of the whole Journey sheet (now gone),
    // not Lenis itself; this restores material weight without a long tail.
    lerp: isWebKitSafari ? 0.12 : 0.085,
    smoothWheel: true,
    wheelMultiplier: isWebKitSafari ? 0.84 : 0.92,
    syncTouch: false,
    overscroll: false,
  });

  lenisInstance.on('scroll', () => scrollFeedback.sync());
}

/* One deliberate downward impulse is enough for Impact: once the door has
   begun opening, the scene gently carries itself through the card arrival.
   The reverse pass remains a small, local magnetic finish near the landing. */
function initImpactSoftSettle() {
  const chapter = document.querySelector('.scroll-chapter--impact');
  const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!chapter || !hasFinePointer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const openSettledProgress = 0.64;
  const closedSettledProgress = 0.27;
  const releaseProgress = 0.90;
  const forwardAutofinishProgress = 0.275;
  const reverseAutofinishProgress = 0.59;
  let restTimer = null;
  let hasSettled = false;
  let isSettling = false;
  let activeSettle = null;
  let carryForward = false;
  let lastScrollY = window.scrollY;
  let lastDirection = 0;

  const getProgressTarget = progress => {
    const chapterTop = window.scrollY + chapter.getBoundingClientRect().top;
    const chapterHeight = chapter.offsetHeight;
    return chapterTop - window.innerHeight + (chapterHeight + window.innerHeight) * progress;
  };

  const getChapterProgress = () => {
    const chapterTop = window.scrollY + chapter.getBoundingClientRect().top;
    return (window.scrollY - (chapterTop - window.innerHeight))
      / (chapter.offsetHeight + window.innerHeight);
  };

  const releaseFromImpact = () => {
    const target = getProgressTarget(releaseProgress);
    isSettling = true;
    activeSettle = 'release';
    const complete = () => {
      isSettling = false;
      activeSettle = null;
      hasSettled = false;
      carryForward = false;
      document.body.classList.remove('is-impact-releasing');
    };

    if (lenisInstance) {
      lenisInstance.scrollTo(target, {
        duration: 1.08,
        easing: anchorScrollEasing,
        onComplete: complete,
      });
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
      window.setTimeout(complete, 820);
    }
  };

  const finishReveal = () => {
    restTimer = null;
    if (isSettling) return;

    const current = window.scrollY;
    const threshold = Math.min(120, Math.max(56, window.innerHeight * 0.08));
    const progress = getChapterProgress();
    const targetProgress = lastDirection < 0 ? closedSettledProgress : openSettledProgress;
    const target = getProgressTarget(targetProgress);

    const approachingDown = lastDirection > 0
      && progress >= forwardAutofinishProgress
      && progress < openSettledProgress
      && current < target - 2;
    const approachingUp = lastDirection < 0
      && progress <= reverseAutofinishProgress
      && progress > closedSettledProgress
      && current > target + 2;

    if (!approachingDown && !approachingUp) {
      if (Math.abs(current - target) > threshold * 1.6) hasSettled = false;
      return;
    }

    isSettling = true;
    hasSettled = true;
    activeSettle = targetProgress === openSettledProgress ? 'open' : 'close';
    const complete = () => {
      const shouldRelease = activeSettle === 'open' && carryForward;
      isSettling = false;
      activeSettle = null;
      if (shouldRelease) releaseFromImpact();
    };
    const remainingViewports = Math.abs(target - current) / window.innerHeight;
    const duration = Math.min(1.2, Math.max(0.72, 0.72 + remainingViewports * 0.35));

    if (lenisInstance) {
      lenisInstance.scrollTo(target, {
        duration,
        easing: anchorScrollEasing,
        onComplete: complete,
      });
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
      window.setTimeout(complete, 460);
    }
  };

  const considerSettle = () => {
    const current = window.scrollY;
    if (Math.abs(current - lastScrollY) > 0.5) {
      lastDirection = current > lastScrollY ? 1 : -1;
    }
    lastScrollY = current;

    const target = getProgressTarget(lastDirection < 0 ? closedSettledProgress : openSettledProgress);
    const threshold = Math.min(120, Math.max(56, window.innerHeight * 0.08));
    if (hasSettled && Math.abs(current - target) > threshold * 1.6) hasSettled = false;
    if (hasSettled && !isSettling) return;
    window.clearTimeout(restTimer);
    restTimer = window.setTimeout(finishReveal, 120);
  };

  // A continuing forward gesture is carried through the open door and out of
  // the sticky scene. Any other new input returns control immediately.
  const releaseToUser = event => {
    const isForwardWheel = event?.type === 'wheel' && event.deltaY > 0;
    const isForwardKey = event?.type === 'keydown'
      && ['ArrowDown', 'PageDown', 'End', ' '].includes(event.key);
    const continuesForward = isForwardWheel || isForwardKey;
    const progress = getChapterProgress();
    const isAtOpenLanding = hasSettled
      && progress >= openSettledProgress - 0.02
      && progress <= openSettledProgress + 0.04;

    if (isSettling && activeSettle === 'release' && continuesForward) return;

    if ((isSettling && activeSettle === 'open' && continuesForward) || (continuesForward && isAtOpenLanding)) {
      carryForward = true;
      document.body.classList.add('is-impact-releasing');
      if (!isSettling) releaseFromImpact();
      return;
    }

    isSettling = false;
    activeSettle = null;
    carryForward = false;
    hasSettled = false;
    document.body.classList.remove('is-impact-releasing');
    window.clearTimeout(restTimer);
  };

  window.addEventListener('scroll', considerSettle, { passive: true });
  window.addEventListener('wheel', releaseToUser, { passive: true });
  window.addEventListener('touchstart', releaseToUser, { passive: true });
  document.addEventListener('keydown', releaseToUser);
}

// Smooth anchor travel uses the same motion system as desktop direct manipulation.
document.addEventListener('click', e => {
  if (e.target.closest('.external-modal')) return;
  const anchor = e.target.closest('a[href^="#"]');
  if (!anchor) return;
  const targetId = anchor.getAttribute('href').slice(1);
  if (!targetId) return;
  if (targetId === 'top') {
    e.preventDefault();
    if (lenisInstance) {
      lenisInstance.scrollTo(0, {
        duration: ANCHOR_SCROLL_DURATION,
        easing: anchorScrollEasing,
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    e.preventDefault();
    if (lenisInstance) {
      lenisInstance.scrollTo(targetEl, {
        duration: ANCHOR_SCROLL_DURATION,
        easing: anchorScrollEasing,
        offset: -24,
      });
    } else {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    history.pushState(null, '', `#${targetId}`);
  }
});

/* Professional Journey: visitors get the three most recent roles; the
   earlier ones wait behind a fade and expand by 3 cards at a time.
   Button text progresses: "Earlier timeline ↓" → "Another life ↓" → "Recent only ↑".
   Collapsing uses a non-destructive dual-motion animation to fold the list and
   bring Get in Touch into focus seamlessly. */
function initJourneyExplorerGlow() {
  const surface = document.querySelector('.section--journey');
  if (!surface || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const followTime = 82;
  let glowFrame = null;
  let scrollFrame = null;
  let lastGlowTime = 0;
  let lastPointer = null;
  let surfaceRect = null;
  let targetGlow = null;
  let currentGlow = null;

  const refreshSurfaceRect = () => {
    surfaceRect = surface.getBoundingClientRect();
  };

  const getGlowPoint = sample => {
    const rect = surfaceRect || (surfaceRect = surface.getBoundingClientRect());
    // 4-side mathematical inset anchor: keeps section glow spotlight center far enough
    // from boundaries so radial light dissolves naturally before touching edges.
    const insetX = Math.min(280, rect.width * 0.32);
    const insetY = Math.min(180, rect.height * 0.15);
    return {
      x: Math.max(insetX, Math.min(rect.width - insetX, sample.x - rect.left)),
      y: Math.max(insetY, Math.min(rect.height - insetY, sample.y - rect.top)),
    };
  };

  const applyGlowPoint = point => {
    surface.style.setProperty('--journey-glow-x', point.x + 'px');
    surface.style.setProperty('--journey-glow-y', point.y + 'px');
    surface.classList.add('is-journey-exploring');
  };

  const renderGlow = now => {
    glowFrame = null;
    if (!targetGlow) return;

    const target = targetGlow;
    if (!currentGlow) currentGlow = { ...target };
    const elapsed = lastGlowTime ? Math.min(64, now - lastGlowTime) : 16.7;
    lastGlowTime = now;
    const follow = 1 - Math.exp(-elapsed / followTime);
    currentGlow.x += (target.x - currentGlow.x) * follow;
    currentGlow.y += (target.y - currentGlow.y) * follow;

    const remaining = Math.hypot(target.x - currentGlow.x, target.y - currentGlow.y);
    if (remaining < 0.15) currentGlow = target;
    applyGlowPoint(currentGlow);
    if (remaining >= 0.15) glowFrame = requestAnimationFrame(renderGlow);
  };

  const setGlowTarget = point => {
    lastPointer = point;
    targetGlow = getGlowPoint(point);
    if (!currentGlow) {
      currentGlow = { ...targetGlow };
      applyGlowPoint(currentGlow);
    }
    if (!glowFrame) glowFrame = requestAnimationFrame(renderGlow);
  };

  surface.addEventListener('pointerenter', event => {
    refreshSurfaceRect();
    setGlowTarget({ x: event.clientX, y: event.clientY });
  });
  surface.addEventListener('pointermove', event => {
    setGlowTarget({ x: event.clientX, y: event.clientY });
  }, { passive: true });
  surface.addEventListener('pointerleave', () => {
    targetGlow = null;
    currentGlow = null;
    lastGlowTime = 0;
    lastPointer = null;
    surfaceRect = null;
    surface.classList.remove('is-journey-exploring');
  });
  const syncGlowToScroll = () => {
    if (!lastPointer || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      if (!lastPointer) return;
      refreshSurfaceRect();
      setGlowTarget(lastPointer);
    });
  };
  window.addEventListener('scroll', syncGlowToScroll, { passive: true });
  window.addEventListener('resize', syncGlowToScroll, { passive: true });
}

function initTimelineCollapse() {
  const list = document.querySelector('.timeline-list');
  const items = list ? Array.from(list.querySelectorAll('.timeline-item')) : [];
  if (!list || items.length <= 3) return;

  let visibleCount = 3;
  const timelineMotionMs = 680;
  const timelineMotionEasing = t => {
    // Exact JS counterpart of cubic-bezier(.37, 0, .63, 1), used below by
    // Lenis so document travel and the list's height share one trajectory.
    let lower = 0;
    let upper = 1;
    let curveT = t;
    for (let i = 0; i < 12; i++) {
      curveT = (lower + upper) / 2;
      const inverse = 1 - curveT;
      const x = 3 * inverse * inverse * curveT * 0.37
        + 3 * inverse * curveT * curveT * 0.63
        + curveT * curveT * curveT;
      if (x < t) lower = curveT;
      else upper = curveT;
    }
    const inverse = 1 - curveT;
    return 3 * inverse * curveT * curveT + curveT * curveT * curveT;
  };
  const returnCueListeners = new Map();

  function clearTimelineReturnCue(role, resetVisual = false) {
    const activate = returnCueListeners.get(role);
    if (activate) role.removeEventListener('pointerenter', activate);
    returnCueListeners.delete(role);
    if (resetVisual) role.classList.remove('is-timeline-attention-pending');
  }

  function setTimelineReturnCue(role) {
    // There is one immediate reminder: the just-read card becomes the black
    // context marker as the timeline brings the next roles into view.
    items.forEach(item => clearTimelineReturnCue(item, true));
    if (!role) return;

    role.classList.add('is-timeline-attention-pending');
    const activate = () => {
      role.classList.remove('is-timeline-attention-pending');
      returnCueListeners.delete(role);
    };
    returnCueListeners.set(role, activate);
    role.addEventListener('pointerenter', activate, { once: true });
  }

  function updateRailFade(fadingRole) {
    if (!fadingRole) {
      list.style.removeProperty('--timeline-rail-fade-start');
      list.style.removeProperty('--timeline-rail-fade-end');
      return;
    }

    const listTop = list.getBoundingClientRect().top;
    const roleRect = fadingRole.getBoundingClientRect();
    const bullets = fadingRole.querySelector('.timeline-bullets');
    const bulletsTop = bullets?.getBoundingClientRect().top ?? roleRect.top + roleRect.height * 0.29;
    const fadeStart = Math.max(0, Math.round(bulletsTop - listTop));
    const fadeEnd = Math.max(fadeStart + 1, Math.round(roleRect.bottom - listTop));

    list.style.setProperty('--timeline-rail-fade-start', fadeStart + 'px');
    list.style.setProperty('--timeline-rail-fade-end', fadeEnd + 'px');
  }

  function setFadingRole(count = visibleCount) {
    const fadingIndex = count < items.length ? count - 1 : -1;
    const fadingRole = items[fadingIndex] || null;
    items.forEach((item, index) => {
      item.classList.toggle('is-timeline-fading', index === fadingIndex);
    });
    updateRailFade(fadingRole);
  }

  function updateVisibility() {
    items.forEach((item, index) => {
      item.style.display = index < visibleCount ? '' : 'none';
    });
    list.classList.toggle('has-fade', visibleCount < items.length);
    setFadingRole();
  }

  // Initial state: show first 3 items with bottom fade
  updateVisibility();

  const timelineSurface = list.closest('.journey-layout__timeline');
  if (timelineSurface && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    // No queued delay: each target is immediate, while the rendered position
    // catches up continuously to create a liquid, non-stepped trail.
    const glowFollowTime = 82;
    let glowFrame = null;
    let scrollFrame = null;
    let lastGlowTime = 0;
    let lastPointer = null;
    let timelineRect = null;
    let targetGlow = null;
    let currentGlow = null;

    const refreshTimelineRect = () => {
      timelineRect = timelineSurface.getBoundingClientRect();
    };

    const getGlowPoint = sample => {
      const rect = timelineRect || (timelineRect = timelineSurface.getBoundingClientRect());
      // 4-side mathematical inset anchor: keeps the glow center far enough (insetX/insetY)
      // from all boundaries (left rail/bullets, right paper, top, bottom) so the 340px radial
      // glow circle dissolves organically to 0% opacity before touching any edge.
      const insetX = Math.min(280, rect.width * 0.32);
      const insetY = Math.min(180, rect.height * 0.15);
      const x = Math.max(insetX, Math.min(rect.width - insetX, sample.x - rect.left));
      const y = Math.max(insetY, Math.min(rect.height - insetY, sample.y - rect.top));
      return { x, y };
    };

    const applyGlowPoint = point => {
      timelineSurface.style.setProperty('--timeline-glow-x', point.x + 'px');
      timelineSurface.style.setProperty('--timeline-glow-y', point.y + 'px');
      timelineSurface.classList.add('is-timeline-exploring');
    };

    const renderLiquidGlow = now => {
      glowFrame = null;
      if (!targetGlow) return;

      const target = targetGlow;
      if (!currentGlow) currentGlow = { ...target };
      const elapsed = lastGlowTime ? Math.min(64, now - lastGlowTime) : 16.7;
      lastGlowTime = now;
      const follow = 1 - Math.exp(-elapsed / glowFollowTime);
      currentGlow.x += (target.x - currentGlow.x) * follow;
      currentGlow.y += (target.y - currentGlow.y) * follow;

      const remaining = Math.hypot(target.x - currentGlow.x, target.y - currentGlow.y);
      if (remaining < 0.15) currentGlow = target;
      applyGlowPoint(currentGlow);

      if (remaining >= 0.15) {
        glowFrame = requestAnimationFrame(renderLiquidGlow);
      }
    };

    const setGlowTarget = point => {
      lastPointer = point;
      targetGlow = getGlowPoint(point);
      if (!currentGlow) {
        currentGlow = { ...targetGlow };
        applyGlowPoint(currentGlow);
      }
      if (!glowFrame) glowFrame = requestAnimationFrame(renderLiquidGlow);
    };

    timelineSurface.addEventListener('pointerenter', event => {
      refreshTimelineRect();
      setGlowTarget({ x: event.clientX, y: event.clientY });
    });
    timelineSurface.addEventListener('pointermove', event => {
      setGlowTarget({ x: event.clientX, y: event.clientY });
    }, { passive: true });
    timelineSurface.addEventListener('pointerleave', () => {
      targetGlow = null;
      currentGlow = null;
      lastGlowTime = 0;
      lastPointer = null;
      timelineRect = null;
      timelineSurface.classList.remove('is-timeline-exploring');
    });
    const syncGlowToScroll = () => {
      if (!lastPointer || scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        if (!lastPointer) return;
        refreshTimelineRect();
        setGlowTarget(lastPointer);
      });
    };
    window.addEventListener('scroll', syncGlowToScroll, { passive: true });
    window.addEventListener('resize', syncGlowToScroll, { passive: true });
  }

  window.addEventListener('resize', () => {
    window.requestAnimationFrame(() => {
      setFadingRole();
    });
  }, { passive: true });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'timeline-expand';
  btn.textContent = 'Earlier timeline ↓';
  list.after(btn);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let isTimelineAnimating = false;

  const scrollWithTimeline = (target, { duration = 0.82, easing = anchorScrollEasing } = {}) => {
    if (Math.abs(target - window.scrollY) <= 2) return;
    if (lenisInstance) {
      lenisInstance.scrollTo(target, {
        duration,
        easing,
      });
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
  };

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
    list.classList.add('is-resizing');
    list.style.height = from + 'px';
    list.style.overflow = 'hidden';
    void list.offsetHeight; // flush, so the next height change transitions
    list.style.transition = `height ${timelineMotionMs}ms cubic-bezier(0.37, 0, 0.63, 1)`;
    list.style.height = to + 'px';
    let complete = false;
    const clear = e => {
      if (e.propertyName !== 'height') return;
      if (complete) return;
      complete = true;
      list.removeEventListener('transitionend', clear);
      window.clearTimeout(fallback);
      // Collapse hides the surplus items while the final height is still
      // held. Releasing the height first briefly restores the full list and
      // produces a second, visible page movement.
      done?.();
      list.classList.remove('is-resizing');
      list.style.height = list.style.overflow = list.style.transition = '';
    };
    const fallback = window.setTimeout(() => clear({ propertyName: 'height' }), timelineMotionMs + 80);
    list.addEventListener('transitionend', clear);
  }

  function expandNext() {
    const prevCount = visibleCount;
    visibleCount = Math.min(items.length, visibleCount + 3);

    // Find the reading anchor before the DOM grows. It is the previously
    // visible role, which remains geometrically unchanged by cards appended
    // below it.
    const contextRole = items[Math.max(0, prevCount - 1)];
    const contextRoleTop = contextRole?.getBoundingClientRect().top
      ?? list.getBoundingClientRect().bottom;
    const targetScrollY = Math.max(0, window.scrollY + contextRoleTop - 76);

    for (let i = prevCount; i < visibleCount; i++) {
      if (items[i]) items[i].style.display = '';
    }
    list.classList.toggle('has-fade', visibleCount < items.length);
    setFadingRole();

    if (!reduced) {
      isTimelineAnimating = true;
      document.documentElement.style.overflowAnchor = 'none';

      // Expanding no longer animates a long container's height. WebKit had to
      // relayout every timeline role and the whole page beneath it on every
      // height frame. The document receives its final geometry once; only the
      // three newly revealed cards animate as independent compositor layers.
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

      window.setTimeout(() => {
        document.documentElement.style.overflowAnchor = '';
        isTimelineAnimating = false;
      }, 820);
      setTimelineReturnCue(contextRole);
      scrollWithTimeline(targetScrollY, {
        duration: 0.72,
        easing: timelineMotionEasing,
      });
    }

    swapButtonText(getButtonText(visibleCount));
  }

  function collapseToRecent() {
    items.forEach(item => clearTimelineReturnCue(item, true));
    const from = list.offsetHeight;
    const thirdItem = items[2];

    const listRect = list.getBoundingClientRect();
    const thirdRect = thirdItem.getBoundingClientRect();
    const to = Math.round(thirdRect.bottom - listRect.top);

    list.classList.add('has-fade');
    setFadingRole(3);
    swapButtonText(getButtonText(3));

    const contactEl = document.getElementById('contact');

    if (reduced) {
      visibleCount = 3;
      updateVisibility();
      (contactEl || btn).scrollIntoView({ behavior: 'auto' });
      return;
    }

    document.documentElement.style.overflowAnchor = 'none';
    isTimelineAnimating = true;

    // Contact will rise by exactly this much as the list closes. Calculate its
    // final document position before either animation starts, then move both
    // the viewport and the list along the same curve.
    const startScrollY = window.scrollY;
    const deltaH = from - to;
    const floatingBar = document.querySelector('.section-bar.is-visible');
    const inset = floatingBar
      ? floatingBar.getBoundingClientRect().bottom + 24
      : 32;
    const contactRect = contactEl?.getBoundingClientRect();
    const targetScrollY = contactRect
      ? Math.max(0, startScrollY + contactRect.top - deltaH - inset)
      : startScrollY;

    runHeight(from, to, () => {
      visibleCount = 3;
      updateVisibility();
      document.documentElement.style.overflowAnchor = '';
      isTimelineAnimating = false;
    });
    scrollWithTimeline(targetScrollY, {
      duration: timelineMotionMs / 1000,
      easing: timelineMotionEasing,
    });
  }

  btn.addEventListener('click', () => {
    if (isTimelineAnimating) return;
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

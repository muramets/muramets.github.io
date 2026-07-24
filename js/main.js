// Page bootstrap: content hydration, public features and admin hand-off.
import { initAuth, isAdmin, login, logout } from './auth.js';
import { initStore } from './store.js';
import { renderPage, applyTexts, applyBlockOrder, applyFooterColOrder, pruneEmptyNav } from './render.js';
import { initScrollInteractionFeedback, initImpactGateFallback } from './features/impact.js';
import { mountJourneyTimeline } from './features/journey/index.js';
import { initJourneyContactHold } from './features/journey-contact-hold.js';
import { initDeckToggle } from './features/deck-toggle.js';
import { initContactForm } from './features/contact-form.js';
import { initLinkedInModal, initMobileNav, placeKickerInNav, placeStatusForMobile } from './features/navigation.js';
import { initSectionBar } from './features/section-bar.js';

const ANCHOR_SCROLL_DURATION = 1.28;
const isWebKitSafari = /Safari\//.test(navigator.userAgent)
  && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/.test(navigator.userAgent);
const journeyDebugEnabled = new URLSearchParams(window.location.search).has('journey-debug');
const anchorScrollEasing = t => 0.5 - Math.cos(Math.PI * t) / 2;
let lenisInstance = null;

document.documentElement.classList.toggle('is-webkit-safari', isWebKitSafari);

if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const resetScroll = () => {
    let frames = 2;
    const enforce = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      if (frames-- > 0) requestAnimationFrame(enforce);
    };
    enforce();
  };
  resetScroll();
  window.addEventListener('pageshow', resetScroll, { once: true });
}

window.addEventListener('pagereveal', event => {
  if (!event.viewTransition) document.documentElement.classList.add('is-first-load');
});
document.addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.code !== 'KeyA') return;
  event.preventDefault();
  isAdmin() ? logout() : login();
});

// Each public feature below is independent of the others by design. A device-
// specific throw in one (a Safari/iPad quirk we haven't hit ourselves, say)
// must never take out unrelated features like the header layout or mobile
// nav — those still have to run even if, e.g., the Journey fold set-up fails.
const safe = (fn, ...args) => {
  try {
    return fn(...args);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[main] ${fn.name || 'feature init'} failed:`, error);
    return undefined;
  }
};

await initStore();
initAuth();
applyTexts();
applyBlockOrder();
applyFooterColOrder();
const pageState = renderPage();
const scrollFeedback = initScrollInteractionFeedback();
safe(initImpactGateFallback);
safe(initLenisScroll, scrollFeedback);

if (isAdmin()) {
  const { initAdmin } = await import('./admin.js');
  initAdmin(pageState);
} else {
  safe(pruneEmptyNav);
  safe(initDeckToggle);
  safe(mountJourneyTimeline, { getLenis: () => lenisInstance, isWebKitSafari });
  safe(initJourneyContactHold);
}

safe(initContactForm);
safe(initMobileNav);
safe(initSectionBar, { getLenis: () => lenisInstance, duration: ANCHOR_SCROLL_DURATION, easing: anchorScrollEasing });
safe(placeStatusForMobile);
safe(placeKickerInNav);
safe(initLinkedInModal);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function initLenisScroll(scrollFeedback) {
  const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (typeof Lenis === 'undefined' || !hasFinePointer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  lenisInstance = new Lenis({
    autoRaf: true,
    lerp: isWebKitSafari ? 0.12 : 0.085,
    smoothWheel: true,
    wheelMultiplier: isWebKitSafari ? 0.84 : 0.92,
    syncTouch: false,
    overscroll: false,
  });
  // Opt-in diagnostics for the Journey fold. It intentionally exists only
  // behind the query flag so the normal public page exposes no debug handle.
  if (journeyDebugEnabled) window.__lenis = lenisInstance;
  lenisInstance.on('scroll', () => scrollFeedback.sync());
}

// All in-page links share Lenis's curve; links outside this page remain native.
document.addEventListener('click', event => {
  if (event.target.closest('.external-modal')) return;
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) return;
  const targetId = anchor.getAttribute('href').slice(1);
  if (!targetId) return;
  event.preventDefault();
  const target = targetId === 'top' ? null : document.getElementById(targetId);
  if (targetId !== 'top' && !target) return;
  if (lenisInstance) {
    lenisInstance.scrollTo(target || 0, {
      duration: ANCHOR_SCROLL_DURATION,
      easing: anchorScrollEasing,
      offset: target ? -24 : 0,
    });
  } else if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (target) history.pushState(null, '', `#${targetId}`);
});

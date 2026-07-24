// Contact's paper arrival is derived from normal-flow geometry. Journey stays
// in that same flow: its intro must leave the viewport with the timeline as
// Contact comes over the sheet. This module has no authority over the fold.
import { CONTROL_VIEWPORT_RATIO } from './journey/timeline-geometry.js';

const DESKTOP_QUERY = '(min-width: 901px)';
const HOLD_DEBUG_QUERY = 'journey-hold-debug';
const CONTACT_SHEET_START_SCALE_X = 0.98;
// The sheet hinges below the footer. Any vertical scale around that distant
// origin pushes its visible top away from the real 24px `Show more` gap.
// Keep the depth/width perspective, but never create empty Journey space.
const CONTACT_SHEET_START_SCALE_Y = 1;
const CONTACT_SHEET_START_TILT_DEG = 4.5;
const CONTACT_SHEET_START_DEPTH_PX = -30;

const getDocumentTop = node => {
  let top = 0;
  let current = node;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent;
  }
  return top;
};

/**
 * The viewport Y a settled Contact's top must reach, before Journey has ever
 * folded: the lower edge of the pinned intro, so Contact goes flat right as
 * it would start obscuring that heading.
 */
export function getIntroSettleViewportY(intro) {
  const stickyTop = parseFloat(getComputedStyle(intro).top) || 0;
  return stickyTop + intro.offsetHeight;
}

/**
 * The same threshold once Journey is compact: the fold never lets Contact
 * travel anywhere near the intro (it deliberately stops at the control's
 * mid-viewport anchor — see CONTROL_VIEWPORT_RATIO), so measuring against the
 * intro there would leave this formula permanently short of 1. Reusing the
 * fold's own anchor ratio keeps the two in agreement instead of drifting.
 */
export function getCompactSettleViewportY() {
  return window.innerHeight * CONTROL_VIEWPORT_RATIO;
}

/**
 * How far Contact has settled into its flat, arrived state (0 = full
 * pre-arrival tilt, 1 = flat), purely from current flow geometry against the
 * given threshold. Exported so the fold (journey/index.js) can read Contact's
 * already-rendered perspective at the instant the visitor clicks, instead of
 * snapping it flat.
 */
export function getContactApproachSettle({ contact, settleViewportY }) {
  const contactFlowTop = getDocumentTop(contact) - window.scrollY;
  const approachDistance = Math.max(1, window.innerHeight - settleViewportY);
  const linearProgress = Math.max(0, Math.min(1,
    (window.innerHeight - contactFlowTop) / approachDistance,
  ));
  // Ease out quickly so `Get in Touch` becomes readable soon after entry,
  // with the exact final pixels resolved at the settle threshold.
  return 1 - Math.pow(1 - linearProgress, 1.6);
}

/** Pure: the paper-arrival transform for a given settle fraction (see above). */
export function getContactSheetTransform(settle) {
  if (settle >= 1) return 'none';
  const scaleX = CONTACT_SHEET_START_SCALE_X
    + (1 - CONTACT_SHEET_START_SCALE_X) * settle;
  const scaleY = CONTACT_SHEET_START_SCALE_Y
    + (1 - CONTACT_SHEET_START_SCALE_Y) * settle;
  const tilt = CONTACT_SHEET_START_TILT_DEG * (1 - settle);
  const depth = CONTACT_SHEET_START_DEPTH_PX * (1 - settle);
  return `perspective(1400px) translateZ(${depth.toFixed(2)}px) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}) rotateX(${tilt.toFixed(3)}deg)`;
}

function createDebug({ section, intro, contact }) {
  if (!new URLSearchParams(window.location.search).has(HOLD_DEBUG_QUERY)) return null;

  const snapshot = () => {
    const introStyle = getComputedStyle(intro);
    const contactStyle = getComputedStyle(contact);
    const sectionStyle = getComputedStyle(section);
    const introRect = intro.getBoundingClientRect();
    const contactRect = contact.getBoundingClientRect();
    const contactFlowTop = getDocumentTop(contact) - window.scrollY;
    const stickyTop = parseFloat(introStyle.top) || 0;

    return {
      scrollY: Math.round(window.scrollY),
      viewport: { height: window.innerHeight, width: window.innerWidth },
      intro: {
        top: Math.round(introRect.top),
        bottom: Math.round(introRect.bottom),
        height: Math.round(introRect.height),
        position: introStyle.position,
        expectedTop: Math.round(stickyTop),
        isAtExpectedTop: Math.abs(introRect.top - stickyTop) < 2,
      },
      journey: {
        top: Math.round(section.getBoundingClientRect().top),
        bottom: Math.round(section.getBoundingClientRect().bottom),
        transform: sectionStyle.transform,
        zIndex: sectionStyle.zIndex,
      },
      contact: {
        top: Math.round(contactRect.top),
        flowTop: Math.round(contactFlowTop),
        bottom: Math.round(contactRect.bottom),
        marginTop: contactStyle.marginTop,
        transform: contactStyle.transform,
        zIndex: contactStyle.zIndex,
        overlapsIntro: contactRect.top < introRect.bottom,
        coversIntroTop: contactRect.top <= introRect.top,
      },
    };
  };

  const debug = {
    snapshot,
    log(label = 'manual') {
      const state = snapshot();
      // eslint-disable-next-line no-console
      console.log(`[journey-contact-hold:${label}]`, state);
      return state;
    },
  };
  window.__journeyContactHoldDebug = debug;
  debug.log('mounted');
  return debug;
}

export function initJourneyContactHold() {
  // Same tradeoff as Journey's own scroll-driven fold (see the
  // html.is-webkit-safari overrides in css/layout.css): WebKit recomposites
  // this whole sheet on every scroll frame for a 3D transform that's purely
  // decorative, and on iPad that reliably drops to a low, stuttering frame
  // rate. Skip the computation entirely there — Contact just arrives flat,
  // the same way Journey's own arrival motion is turned off for this engine.
  if (document.documentElement.classList.contains('is-webkit-safari')) return () => {};

  const section = document.querySelector('.section--journey');
  const layout = section?.querySelector('.journey-layout');
  const intro = layout?.querySelector('.journey-layout__intro');
  const contact = document.getElementById('contact');
  const footer = document.querySelector('.footer');
  const media = matchMedia(DESKTOP_QUERY);
  if (!section || !layout || !intro || !contact) return () => {};

  let frame = null;
  let destroyed = false;
  let footerDepth = null;
  const debug = createDebug({ section, intro, contact });

  const clearContactSheetPerspective = () => {
    document.body.style.removeProperty('--contact-sheet-transform');
    document.body.style.removeProperty('--contact-footer-depth');
  };
  const syncContactSheetOrigin = () => {
    const nextDepth = footer?.offsetHeight ?? 0;
    if (nextDepth === footerDepth) return;
    footerDepth = nextDepth;
    document.body.style.setProperty('--contact-footer-depth', `${nextDepth}px`);
  };
  const renderContactSheetPerspective = () => {
    // Measure flow geometry, not getBoundingClientRect(): the latter already
    // includes this transform and would make the progress feed back on itself.
    // The threshold itself depends on Journey's current state: compact once
    // folded, the tall intro-relative one otherwise — see the two getters.
    const settleViewportY = document.body.classList.contains('is-journey-compact')
      ? getCompactSettleViewportY()
      : getIntroSettleViewportY(intro);
    const settle = getContactApproachSettle({ contact, settleViewportY });
    document.body.style.setProperty('--contact-sheet-transform', getContactSheetTransform(settle));
  };

  const sync = () => {
    frame = null;
    if (destroyed || !media.matches || document.body.classList.contains('is-timeline-folding')) {
      clearContactSheetPerspective();
      return;
    }

    syncContactSheetOrigin();
    renderContactSheetPerspective();
  };
  const schedule = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  media.addEventListener('change', schedule);
  window.addEventListener('timelinefoldstart', schedule);
  window.addEventListener('timelinefoldend', schedule);
  schedule();

  return () => {
    destroyed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    media.removeEventListener('change', schedule);
    window.removeEventListener('timelinefoldstart', schedule);
    window.removeEventListener('timelinefoldend', schedule);
    clearContactSheetPerspective();
    if (window.__journeyContactHoldDebug === debug) {
      delete window.__journeyContactHoldDebug;
    }
  };
}

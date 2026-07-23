import {
  COMPACT_ROLE_COUNT,
  JOURNEY_PHASE,
  getFadingRoleIndex,
  getNextVisibleCount,
  getTimelineControlLabel,
} from './timeline-state.js';
import {
  getCollapseFrame,
  getCollapsePlan,
  getFoldScrollLimit,
} from './timeline-geometry.js';
import { mountTimelineGlow } from './timeline-glow.js';

const REVEAL_DURATION_MS = 520;
const FOLD_DURATION_MS = 1500;
// Longest dissolve edge trailing the clipping boundary. It is only ever this
// tall while roles are still being eaten; it shrinks to zero as the list
// reaches its compact height, so the three surviving roles are never masked.
const FOLD_FADE_MAX = 260;
const MOTION_CURVE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const JOURNEY_DEBUG_QUERY = 'journey-debug';
const foldEase = t => (t < 0.5
  ? 4 * t * t * t
  : 1 - Math.pow(-2 * t + 2, 3) / 2);

const noOpController = Object.freeze({
  destroy() {},
  refresh() {},
  get phase() { return JOURNEY_PHASE.COMPACT; },
});

/**
 * Mount public Journey disclosure behaviour onto already-rendered role cards.
 * Rendering and admin editing stay in entities.js/admin.js; this component
 * owns only visitor interaction, geometry and temporary scroll coordination.
 */
export function mountJourneyTimeline({
  section = document.querySelector('.section--journey'),
  getLenis = () => null,
  isWebKitSafari = false,
} = {}) {
  const list = section?.querySelector('.timeline-list');
  if (!section || !list) return noOpController;

  let items = Array.from(list.querySelectorAll('.timeline-item'));
  if (items.length <= COMPACT_ROLE_COUNT) return noOpController;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const returnCueListeners = new Map();
  const timelineSurface = list.closest('.journey-layout__timeline');
  let phase = JOURNEY_PHASE.COMPACT;
  let visibleCount = COMPACT_ROLE_COUNT;
  let foldToken = 0;
  let destroyed = false;
  let foldReservation = null;
  const debug = createJourneyDebug();

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'timeline-expand';
  control.textContent = getTimelineControlLabel(visibleCount, items.length);
  control.setAttribute('aria-controls', ensureListId(list));
  list.after(control);

  // The contact sheet is the only surface that must visually travel through
  // the temporary reserved Journey height. It never becomes fixed or cloned;
  // the normal-flow section receives an equal, transient translation only
  // while the reservation exists.
  const contact = document.getElementById('contact');
  const originalContactFoldShift = contact?.style.getPropertyValue('--journey-fold-contact-shift') ?? '';
  const originalContactFoldShiftPriority = contact?.style.getPropertyPriority('--journey-fold-contact-shift') ?? '';
  const root = document.documentElement;
  const originalRootScrollBehavior = root.style.getPropertyValue('scroll-behavior');
  const originalRootScrollBehaviorPriority = root.style.getPropertyPriority('scroll-behavior');
  const originalSheetFoldTransform = section.style.getPropertyValue('--journey-fold-sheet-transform');
  const originalSheetFoldTransformPriority = section.style.getPropertyPriority('--journey-fold-sheet-transform');
  const originalSheetFoldOpacity = section.style.getPropertyValue('--journey-fold-sheet-opacity');
  const originalSheetFoldOpacityPriority = section.style.getPropertyPriority('--journey-fold-sheet-opacity');
  const originalLayoutFoldTransform = section.style.getPropertyValue('--journey-fold-layout-transform');
  const originalLayoutFoldTransformPriority = section.style.getPropertyPriority('--journey-fold-layout-transform');
  const originalLayoutFoldOpacity = section.style.getPropertyValue('--journey-fold-layout-opacity');
  const originalLayoutFoldOpacityPriority = section.style.getPropertyPriority('--journey-fold-layout-opacity');

  const glow = mountTimelineGlow({
    surface: timelineSurface,
    isWebKitSafari,
    isFolding: () => phase === JOURNEY_PHASE.COLLAPSING,
  });

  function ensureListId(node) {
    if (!node.id) node.id = 'journey-timeline';
    return node.id;
  }

  function setControlState() {
    const isFolding = phase === JOURNEY_PHASE.COLLAPSING;
    control.disabled = isFolding;
    control.setAttribute('aria-busy', String(isFolding));
    control.classList.toggle('is-folding', isFolding);
    control.setAttribute('aria-expanded', String(visibleCount >= items.length));
    control.textContent = getTimelineControlLabel(visibleCount, items.length, isFolding);
  }

  function clearReturnCue(role, resetVisual = false) {
    const activate = returnCueListeners.get(role);
    if (activate) role.removeEventListener('pointerenter', activate);
    returnCueListeners.delete(role);
    if (resetVisual) role.classList.remove('is-timeline-attention-pending');
  }

  function setReturnCue(role) {
    items.forEach(item => clearReturnCue(item, true));
    if (!role) return;
    role.classList.add('is-timeline-attention-pending');
    const activate = () => {
      role.classList.remove('is-timeline-attention-pending');
      returnCueListeners.delete(role);
    };
    returnCueListeners.set(role, activate);
    role.addEventListener('pointerenter', activate, { once: true });
  }

  function updateRailFade(count = visibleCount) {
    const fadingIndex = getFadingRoleIndex(count, items.length);
    const fadingRole = items[fadingIndex] || null;
    items.forEach((item, index) => {
      item.classList.toggle('is-timeline-fading', index === fadingIndex);
    });
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
    list.style.setProperty('--timeline-rail-fade-start', `${fadeStart}px`);
    list.style.setProperty('--timeline-rail-fade-end', `${fadeEnd}px`);
  }

  function renderVisibleItems() {
    items.forEach((item, index) => {
      item.style.display = index < visibleCount ? '' : 'none';
    });
    list.classList.toggle('has-fade', visibleCount < items.length);
    updateRailFade();
    setControlState();
  }

  function revealItems(from, to) {
    for (let index = from; index < to; index++) {
      const item = items[index];
      if (!item) continue;
      item.style.display = '';
      if (reducedMotion) continue;
      item.classList.add('is-revealing');
      item.style.animationDelay = `${(index - from) * 60}ms`;
      item.addEventListener('animationend', () => {
        item.classList.remove('is-revealing');
        item.style.animationDelay = '';
      }, { once: true });
    }
  }

  function animateListHeight(fromHeight, toHeight) {
    if (fromHeight === toHeight) return Promise.resolve();
    list.classList.add('is-resizing');
    list.style.height = `${fromHeight}px`;
    list.style.overflow = 'hidden';
    list.style.transition = 'none';
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        list.removeEventListener('transitionend', onTransitionEnd);
        window.clearTimeout(fallback);
        list.classList.remove('is-resizing');
        list.style.height = list.style.overflow = list.style.transition = '';
        getLenis()?.resize?.();
        resolve();
      };
      const onTransitionEnd = event => {
        if (event.target === list && event.propertyName === 'height') finish();
      };
      const fallback = window.setTimeout(finish, REVEAL_DURATION_MS + 100);
      list.addEventListener('transitionend', onTransitionEnd);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        list.style.transition = `height ${REVEAL_DURATION_MS}ms ${MOTION_CURVE}`;
        list.style.height = `${toHeight}px`;
      }));
    });
  }

  // Lenis proxies the window scroll: native `window.scrollTo` is silently
  // reverted to Lenis's own animated target every frame. So every scroll write
  // during the fold has to go through Lenis. `immediate` resets Lenis's own
  // target in that same frame, and `force` protects the fold from any active
  // smooth-scroll state. This must remain one Lenis write: pairing setScroll
  // with scrollTo creates two native-scroll notifications, allowing Lenis to
  // restore the stale coordinate between fold frames. Without Lenis — reduced
  // motion, coarse pointer — the native path works untouched.
  function applyScroll(y) {
    const lenis = getLenis();
    const target = Math.max(0, Math.round(y));
    const before = Math.round(window.scrollY);
    if (lenis?.scrollTo) {
      // scrollTo is the sole Lenis owner. Its immediate path updates both the
      // physical and internal coordinates atomically for this animation frame.
      lenis.scrollTo(target, { immediate: true, force: true });
      recordDebugCall('lenis', target, before, lenis);
      return;
    }
    window.scrollTo(0, target);
    recordDebugCall('native', target, before, null);
  }

  // Lenis 1.1.18's immediate path writes rootElement.scrollTop and then
  // immediately reads it back in reset(). The page-wide native smooth-scroll
  // rule otherwise leaves that read at the old coordinate, so Lenis restores
  // the stale target and the control ceiling never takes effect. This inline
  // override exists only for the fold; Lenis remains the sole scroll writer.
  function useInstantNativeScroll() {
    root.style.setProperty('scroll-behavior', 'auto', 'important');
  }

  function restoreNativeScrollBehavior() {
    if (originalRootScrollBehavior) {
      root.style.setProperty(
        'scroll-behavior',
        originalRootScrollBehavior,
        originalRootScrollBehaviorPriority,
      );
    } else {
      root.style.removeProperty('scroll-behavior');
    }
  }

  function restoreFoldProperty(node, name, value, priority) {
    if (value) node.style.setProperty(name, value, priority);
    else node.style.removeProperty(name);
  }

  // The paper sheet and its content use view-timeline transforms before a
  // fold begins. Removing those transforms changes the page boundary on the
  // first fold frame. Capture their current pixels, then stop the timeline
  // animation without visually flattening either layer.
  function freezeJourneyPresentation() {
    const layout = section.querySelector('.journey-layout');
    const sheetStyle = getComputedStyle(section);
    section.style.setProperty('--journey-fold-sheet-transform', sheetStyle.transform);
    section.style.setProperty('--journey-fold-sheet-opacity', sheetStyle.opacity);
    if (!layout) return;
    const layoutStyle = getComputedStyle(layout);
    section.style.setProperty('--journey-fold-layout-transform', layoutStyle.transform);
    section.style.setProperty('--journey-fold-layout-opacity', layoutStyle.opacity);
  }

  function releaseJourneyPresentation() {
    restoreFoldProperty(
      section,
      '--journey-fold-sheet-transform',
      originalSheetFoldTransform,
      originalSheetFoldTransformPriority,
    );
    restoreFoldProperty(
      section,
      '--journey-fold-sheet-opacity',
      originalSheetFoldOpacity,
      originalSheetFoldOpacityPriority,
    );
    restoreFoldProperty(
      section,
      '--journey-fold-layout-transform',
      originalLayoutFoldTransform,
      originalLayoutFoldTransformPriority,
    );
    restoreFoldProperty(
      section,
      '--journey-fold-layout-opacity',
      originalLayoutFoldOpacity,
      originalLayoutFoldOpacityPriority,
    );
  }

  function createJourneyDebug() {
    if (!new URLSearchParams(window.location.search).has(JOURNEY_DEBUG_QUERY)) return null;
    const state = {
      calls: [],
      frames: [],
      plan: null,
      final: null,
      startedAt: null,
      endedAt: null,
      reset() {
        this.calls.length = 0;
        this.frames.length = 0;
        this.plan = null;
        this.final = null;
        this.startedAt = null;
        this.endedAt = null;
      },
    };
    window.__journeyFoldDebug = state;
    return state;
  }

  function debugElapsed() {
    return debug?.startedAt == null ? null : Math.round(performance.now() - debug.startedAt);
  }

  function getLenisDebugState(lenis = getLenis()) {
    return {
      animatedScroll: Number.isFinite(lenis?.animatedScroll) ? Math.round(lenis.animatedScroll) : null,
      targetScroll: Number.isFinite(lenis?.targetScroll) ? Math.round(lenis.targetScroll) : null,
    };
  }

  function recordDebugCall(writer, target, before, lenis) {
    if (!debug) return;
    debug.calls.push({
      ms: debugElapsed(),
      writer,
      target,
      before,
      after: Math.round(window.scrollY),
      ...getLenisDebugState(lenis),
    });
  }

  function recordDebugFrame({ plan, frame, expectedScroll, stage }) {
    if (!debug) return;
    const journey = section.getBoundingClientRect();
    const layout = section.querySelector('.journey-layout')?.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const introRect = section.querySelector('.journey-layout__intro')?.getBoundingClientRect();
    const contactRect = contact?.getBoundingClientRect();
    const scroll = Math.round(window.scrollY);
    debug.frames.push({
      ms: debugElapsed(),
      stage,
      expectedScroll,
      actualScroll: scroll,
      controlBottom: Math.round(controlRect.bottom),
      introTop: introRect ? Math.round(introRect.top) : null,
      contactTop: contactRect ? Math.round(contactRect.top) : null,
      listHeight: Math.round(list.getBoundingClientRect().height),
      reservedHeight: frame.reservedHeight,
      journeyDocBottom: Math.round(journey.bottom + scroll),
      layoutDocBottom: layout ? Math.round(layout.bottom + scroll) : null,
      ...getLenisDebugState(),
    });
    // These events let DevTools users wait for results without polling rAF.
    window.dispatchEvent(new CustomEvent('journeyfolddebugframe', {
      detail: debug.frames[debug.frames.length - 1],
    }));
  }

  function createFoldReservation() {
    if (foldReservation) return foldReservation;
    foldReservation = document.createElement('div');
    foldReservation.className = 'timeline-fold-reservation';
    foldReservation.setAttribute('aria-hidden', 'true');
    control.after(foldReservation);
    return foldReservation;
  }

  // This owns the Journey sheet, not the timeline. Keeping this write outside
  // the list renderer is deliberate: the paper surface and sticky heading
  // must not follow the collapsing list's transient height.
  function setJourneySurfaceHold(height) {
    createFoldReservation().style.height = `${height}px`;
    if (contact) contact.style.setProperty('--journey-fold-contact-shift', `-${height}px`);
  }

  function releaseJourneySurfaceHold() {
    foldReservation?.remove();
    foldReservation = null;
    if (!contact) return;
    if (originalContactFoldShift) {
      contact.style.setProperty(
        '--journey-fold-contact-shift',
        originalContactFoldShift,
        originalContactFoldShiftPriority,
      );
    } else {
      contact.style.removeProperty('--journey-fold-contact-shift');
    }
  }

  function syncLenisAfterLayout(scroll) {
    getLenis()?.resize?.();
    applyScroll(scroll);
  }

  // This owns only the clipped timeline. It is intentionally independent of
  // the Journey sheet hold above, so list height can change without pulling
  // the page background or sticky intro up with it.
  function renderTimelineFoldFrame(plan, eased) {
    const frame = getCollapseFrame(plan, eased);
    list.style.height = `${frame.listHeight}px`;
    const fade = Math.max(0, Math.min(FOLD_FADE_MAX, frame.listHeight - plan.compactHeight));
    list.style.setProperty('--timeline-collapse-fade', `${fade}px`);
    return frame;
  }

  function applyControlCeiling(plan, startScroll, reservedHeight, eased) {
    const target = getFoldScrollLimit({
      plan,
      startScroll,
      reservedHeight,
      eased,
    });
    applyScroll(target);
    return target;
  }

  /**
   * Keep Journey's real grid footprint fixed during the visual fold. The list
   * gives its released height to a normal-flow reservation after the control;
   * meanwhile Contact takes the inverse visual offset. That lets the heading's
   * native sticky containing block remain stable without changing the final
   * composition. The control position becomes a per-frame scroll ceiling:
   * it can approach, but never pass, its compact viewport location.
   */
  function animateCollapse(plan) {
    const startScroll = window.scrollY;
    const token = ++foldToken;
    if (debug) {
      debug.reset();
      debug.startedAt = performance.now();
      debug.plan = { ...plan, startScroll: Math.round(startScroll) };
      window.dispatchEvent(new CustomEvent('journeyfolddebugstart', { detail: debug.plan }));
    }
    list.classList.add('is-resizing');
    list.style.height = `${plan.expandedHeight}px`;
    list.style.overflow = 'hidden';
    list.style.transition = 'none';
    setJourneySurfaceHold(0);
    // Establish the ceiling before the first visible height mutation. This
    // handles a click made with the control already above its final anchor.
    const initialScroll = applyControlCeiling(plan, startScroll, 0, 0);
    recordDebugFrame({
      plan,
      frame: { reservedHeight: 0 },
      expectedScroll: initialScroll,
      stage: 'prepared',
    });

    return new Promise(resolve => {
      const startedAt = performance.now();
      const step = now => {
        if (destroyed || token !== foldToken) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / FOLD_DURATION_MS);
        const eased = foldEase(progress);
        const frame = getCollapseFrame(plan, eased);
        // Claim this frame's scroll before writing geometry. The old sequence
        // wrote the shorter list first, leaving Lenis one paint to show the
        // Journey sheet above its limit before it was corrected at the end.
        const expectedScroll = applyControlCeiling(plan, startScroll, frame.reservedHeight, eased);
        setJourneySurfaceHold(frame.reservedHeight);
        renderTimelineFoldFrame(plan, eased);
        recordDebugFrame({ plan, frame, expectedScroll, stage: 'folding' });
        if (progress < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  async function revealNextRoles() {
    const previousCount = visibleCount;
    const fromHeight = reducedMotion ? 0 : list.offsetHeight;
    const contextRole = items[previousCount - 1];
    visibleCount = getNextVisibleCount(visibleCount, items.length);
    revealItems(previousCount, visibleCount);
    list.classList.toggle('has-fade', visibleCount < items.length);
    updateRailFade();
    setControlState();
    if (reducedMotion) return;

    phase = JOURNEY_PHASE.EXPANDED;
    document.documentElement.style.overflowAnchor = 'none';
    setReturnCue(contextRole);
    await animateListHeight(fromHeight, list.scrollHeight);
    document.documentElement.style.overflowAnchor = '';
  }

  async function collapseToCompact() {
    items.forEach(item => clearReturnCue(item, true));

    const plan = getCollapsePlan({
      list,
      compactLastItem: items[COMPACT_ROLE_COUNT - 1],
      control,
    });

    if (reducedMotion) {
      visibleCount = COMPACT_ROLE_COUNT;
      renderVisibleItems();
      // Land on the same composed position, just without the motion.
      if (plan) syncLenisAfterLayout(plan.targetScroll);
      phase = JOURNEY_PHASE.COMPACT;
      return;
    }

    if (!plan) return;

    const originalOverflowAnchor = document.documentElement.style.overflowAnchor;
    phase = JOURNEY_PHASE.COLLAPSING;
    setControlState();
    document.documentElement.style.overflowAnchor = 'none';
    list.classList.add('has-fade', 'is-collapsing');
    updateRailFade(COMPACT_ROLE_COUNT);
    freezeJourneyPresentation();
    useInstantNativeScroll();
    document.body.classList.add('is-journey-collapsing', 'is-timeline-folding');
    window.dispatchEvent(new Event('timelinefoldstart'));

    try {
      const completed = await animateCollapse(plan);
      if (!completed) return;
      // Commit compact roles while their measured height is still present.
      // Removing the reservation and Contact offset in this same task swaps
      // the temporary footprint for the real compact DOM pixel-for-pixel.
      visibleCount = COMPACT_ROLE_COUNT;
      renderVisibleItems();
      releaseJourneySurfaceHold();
      list.classList.remove('is-resizing', 'is-collapsing');
      list.style.height = list.style.overflow = list.style.transition = '';
      list.style.removeProperty('--timeline-collapse-fade');
      // Re-assert the coordinate already reached in the final rAF only after
      // Lenis reads the compact document bounds. Passing plan.targetScroll is
      // essential: reading window.scrollY here would adopt a stale position
      // and let resize clamp it to the page bottom as a visible second phase.
      syncLenisAfterLayout(plan.targetScroll);
      recordDebugFrame({
        plan,
        frame: { reservedHeight: 0 },
        expectedScroll: plan.targetScroll,
        stage: 'compact',
      });
      phase = JOURNEY_PHASE.COMPACT;
      setControlState();
    } finally {
      foldToken++;
      releaseJourneySurfaceHold();
      list.classList.remove('is-resizing', 'is-collapsing');
      document.body.classList.remove('is-journey-collapsing', 'is-timeline-folding');
      releaseJourneyPresentation();
      restoreNativeScrollBehavior();
      document.documentElement.style.overflowAnchor = originalOverflowAnchor;
      window.dispatchEvent(new Event('timelinefoldend'));
      if (debug) {
        debug.endedAt = performance.now();
        debug.final = {
          phase,
          scroll: Math.round(window.scrollY),
          controlBottom: Math.round(control.getBoundingClientRect().bottom),
          contactTop: contact ? Math.round(contact.getBoundingClientRect().top) : null,
          ...getLenisDebugState(),
        };
        window.dispatchEvent(new CustomEvent('journeyfolddebugend', { detail: debug }));
      }
    }
  }

  const onControlClick = () => {
    if (destroyed || phase === JOURNEY_PHASE.COLLAPSING) return;
    if (visibleCount >= items.length) void collapseToCompact();
    else void revealNextRoles();
  };
  const onResize = () => requestAnimationFrame(() => updateRailFade());

  control.addEventListener('click', onControlClick);
  window.addEventListener('resize', onResize, { passive: true });
  renderVisibleItems();

  return {
    get phase() { return phase; },
    refresh() {
      if (phase === JOURNEY_PHASE.COLLAPSING) return;
      const previousTotal = items.length;
      items = Array.from(list.querySelectorAll('.timeline-item'));
      if (items.length <= COMPACT_ROLE_COUNT) {
        control.remove();
        return;
      }
      visibleCount = visibleCount >= previousTotal
        ? items.length
        : Math.min(visibleCount, items.length);
      renderVisibleItems();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      foldToken++;
      items.forEach(item => clearReturnCue(item, true));
      control.removeEventListener('click', onControlClick);
      window.removeEventListener('resize', onResize);
      glow.destroy();
      control.remove();
      list.classList.remove('is-resizing', 'is-collapsing', 'has-fade');
      list.style.height = list.style.overflow = list.style.transition = '';
      list.style.removeProperty('--timeline-collapse-fade');
      releaseJourneySurfaceHold();
      releaseJourneyPresentation();
      restoreNativeScrollBehavior();
      document.body.classList.remove('is-journey-collapsing', 'is-timeline-folding');
    },
  };
}

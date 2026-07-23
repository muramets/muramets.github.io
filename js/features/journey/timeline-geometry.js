// Where the control's lower edge lands after the fold, as a fraction of the
// viewport height. ~0.48 places the Journey→Contact seam near the vertical
// centre: the last compact role shows only its tail above the fold, and Get in
// Touch is already arriving below — the deliberate compact composition.
const CONTROL_VIEWPORT_RATIO = 0.48;

/**
 * Measure the compact destination without changing the rendered state. The
 * control lives directly after the list, so shrinking the list moves it up by
 * exactly the removed height. This makes the control the viewport anchor —
 * never Journey's section edge and never Contact's own geometry.
 *
 * The returned `targetScroll` is absolute: it depends only on the compact
 * layout, not on where the visitor was scrolled when they clicked. It is
 * clamped to the post-collapse maxScroll so the final DOM commit cannot
 * produce a browser-clamped frame.
 */
export function getCollapsePlan({ list, compactLastItem, control, viewportRatio = CONTROL_VIEWPORT_RATIO }) {
  if (!list || !compactLastItem || !control) return null;

  const listRect = list.getBoundingClientRect();
  const lastItemRect = compactLastItem.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  const expandedHeight = Math.round(listRect.height);
  const compactHeight = Math.round(lastItemRect.bottom - listRect.top);
  const heightDelta = expandedHeight - compactHeight;

  if (!Number.isFinite(heightDelta) || heightDelta <= 0) return null;

  const controlDocumentBottom = Math.round(window.scrollY + controlRect.bottom);
  const controlBottomAfterCollapse = controlDocumentBottom - heightDelta;
  const desiredControlBottom = window.innerHeight * viewportRatio;
  let targetScroll = Math.round(controlBottomAfterCollapse - desiredControlBottom);

  // Keep every animated frame within bounds: the deepest the page can scroll
  // once the collapse has removed `heightDelta` of document.
  const docHeight = typeof document !== 'undefined'
    ? document.documentElement.scrollHeight
    : Infinity;
  const finalMaxScroll = Math.max(0, Math.round(docHeight - heightDelta - window.innerHeight));
  targetScroll = Math.max(0, Math.min(targetScroll, finalMaxScroll));

  return {
    expandedHeight,
    compactHeight,
    heightDelta,
    controlDocumentBottom,
    desiredControlBottom,
    targetScroll,
  };
}

/**
 * Derive one fold frame from a single eased value. `releasedHeight` is the
 * exact amount of real Journey height removed from the list in this frame.
 * Contact follows that physical reduction in normal document flow.
 */
export function getCollapseFrame(plan, eased) {
  const listHeight = Math.round(plan.expandedHeight - plan.heightDelta * eased);
  return {
    listHeight,
    releasedHeight: plan.expandedHeight - listHeight,
  };
}

/**
 * Scroll rides the same eased clock as the released list height (see
 * `getCollapseFrame`), so the two are mathematically locked together: the
 * control's viewport position moves monotonically from wherever it started
 * to its compact anchor, in lockstep with the list, on every single frame.
 *
 * A prior "hold scroll, then chase the control once it would cross its
 * anchor" version produced a long visually-static plateau whenever the
 * control already had little headroom above its anchor at click time (the
 * common case) — height kept releasing underneath while nothing moved
 * on screen, then the whole remaining distance was covered at once. Driving
 * both from the same `eased` value removes that plateau: the seam is always
 * visibly travelling, and the control still never overshoots past its anchor
 * (the interpolation lands exactly on it at eased = 1, monotonically).
 */
export function getFoldScrollLimit({ plan, startScroll, eased = 1 }) {
  return Math.round(startScroll + (plan.targetScroll - startScroll) * eased);
}

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
 * Derive one fold frame from a single eased value. The reservation is the
 * exact complement of the visible list height, including rounding, so the
 * timeline column and Journey's sticky containing block never change height
 * while a frame is being presented.
 */
export function getCollapseFrame(plan, eased) {
  const listHeight = Math.round(plan.expandedHeight - plan.heightDelta * eased);
  return {
    listHeight,
    reservedHeight: plan.expandedHeight - listHeight,
  };
}

/**
 * The control is the fold ceiling. Before the shrinking control would cross
 * its final viewport position, preserve the visitor's original scroll. From
 * that exact frame on, move upward with the control so it can never leave the
 * viewport above its compact destination. This is coordinate-based rather
 * than duration-based, which removes the old "fold first, scroll later"
 * behaviour.
 */
export function getFoldScrollLimit({ plan, startScroll, reservedHeight, eased = 1 }) {
  // A real pointer click can only hit a control that is in the viewport, so
  // the compact target is normally above startScroll. Keep the inverse case
  // continuous too: it can occur after a programmatic focus/scroll change.
  if (plan.targetScroll > startScroll) {
    return Math.round(startScroll + (plan.targetScroll - startScroll) * eased);
  }
  const currentControlBottom = plan.controlDocumentBottom - reservedHeight;
  const controlCeiling = Math.round(currentControlBottom - plan.desiredControlBottom);
  return Math.max(0, Math.min(startScroll, controlCeiling));
}

// Impact scene interaction kept separate from the page bootstrap.

/* Cards remain genuinely live during a scroll. When the composition travels
   beneath a resting cursor, hit-testing promotes whichever tile reaches that
   point — exactly like direct hover, with no invented "intent" gate. */
export function initScrollInteractionFeedback() {
  let lastPointer = null;
  let hoveredTile = null;
  let hoverFrame = null;
  const impactChapter = document.querySelector('.scroll-chapter--impact');
  // The outer chapter is a normal-flow element (270svh tall, never sticky),
  // so its document-space top is scroll-invariant and safe to cache.
  let impactTop = 0;
  let impactHeight = 0;
  const refreshImpactBounds = () => {
    if (!impactChapter) return;
    const rect = impactChapter.getBoundingClientRect();
    impactTop = window.scrollY + rect.top;
    impactHeight = impactChapter.offsetHeight;
  };
  // The cards themselves live inside the `position: sticky` scene, whose
  // viewport rect barely changes while pinned — caching it once (as this used
  // to) goes stale the instant the visitor scrolls at all past mount, and hit
  // tests start comparing a live pointer against a frozen box. Measure these
  // live, viewport-relative, every time instead; there are only a handful of
  // cards, so this is cheap relative to the layout work scrolling already does.
  const getImpactTiles = () => (impactChapter
    ? Array.from(impactChapter.querySelectorAll('.story-tile'))
    : []);
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

  const resetFeaturedHoverAtClosedDoors = () => {
    const progress = getImpactProgress();
    if (progress === null || progress > 0.272) return;

    const featured = document.querySelector('.scroll-chapter__content .story-tile.featured.mint');
    if (!featured) return;
    featured.classList.remove('is-hover-primed', 'has-hover-intent');
    if (hoveredTile === featured) hoveredTile = null;
  };

  const activateCardHover = tile => {
    if (!tile) return;
    tile.classList.add('has-hover-intent');
    if (tile.matches('.featured.mint')) tile.classList.add('is-hover-primed');
  };

  const syncHoverAtPointer = () => {
    hoverFrame = null;
    if (!isImpactActive()) return;
    let nextTile = null;
    if (lastPointer) {
      nextTile = getImpactTiles().find(tile => {
        const r = tile.getBoundingClientRect();
        return lastPointer.x >= r.left && lastPointer.x <= r.right
          && lastPointer.y >= r.top && lastPointer.y <= r.bottom;
      }) ?? null;
    }
    if (hoveredTile && hoveredTile !== nextTile) {
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
    resetFeaturedHoverAtClosedDoors();
    requestHoverSync();
  }, { passive: true });

  return { sync: requestHoverSync };
}

// Floating page-section navigation.

/* ── Mobile: floating section bar (main page only) ────────────
   Verge-style frosted pill pinned to the viewport top. Built from the
   page's [data-block-id] sections; labels come from the ribbon text
   ("Section 01 / Impact" → "Impact"). Scrollspy highlights the section
   in view; tapping glides to it. Pages with one section get no bar. */
export function initSectionBar({ getLenis, duration, easing }) {
  const sections = [...document.querySelectorAll('[data-block-id]')];
  if (sections.length < 2) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bar = document.createElement('nav');
  bar.className = 'section-bar';
  bar.setAttribute('aria-label', 'Page sections');

  const tabs = new Map();
  const getSectionFocus = section => (section.id === 'experience'
    ? section.querySelector('.timeline-item')
    : section.querySelector('.section-title')) || section;
  const getSectionViewportTarget = section => {
    const floatingInset = Math.max(96, (bar.offsetHeight || 0) + 28);
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    if (section.id === 'achievements') {
      const chapter = section.querySelector('.scroll-chapter--impact');
      if (chapter) {
        const chapterTop = window.scrollY + chapter.getBoundingClientRect().top;
        // This is the full-viewport, closed-door frame used by Impact itself.
        return Math.max(0, chapterTop - window.innerHeight
          + (chapter.offsetHeight + window.innerHeight) * 0.27);
      }
    }

    const focus = getSectionFocus(section);
    const target = Math.max(0, window.scrollY + focus.getBoundingClientRect().top - floatingInset);
    return section === sections[sections.length - 1]
      ? Math.min(target, Math.max(0, maxScroll - 8))
      : target;
  };

  sections.forEach(section => {
    const label = section.querySelector('.section-ribbon')
      ?.textContent.split('/').pop().trim() || section.dataset.blockId;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'section-bar-tab';
    tab.textContent = label;
    tab.addEventListener('click', () => navigateToSection(section));
    tabs.set(section, tab);
    bar.append(tab);
  });

  document.body.append(bar);

  // Live chrome-offset token consumed by sticky/docked headings elsewhere
  // (Impact, Journey) so their resting position tracks the bar's real box
  // instead of an independently eyeballed value. `getBoundingClientRect()`
  // is safe to read every tick here — the bar is `position: fixed`, so its
  // rect is scroll-invariant (see docs/REFACTOR-READINESS.md rule 1).
  const syncTopbarBottom = () => {
    document.documentElement.style.setProperty(
      '--topbar-bottom', `${bar.getBoundingClientRect().bottom}px`,
    );
  };
  new ResizeObserver(syncTopbarBottom).observe(bar);
  document.fonts?.ready.then(syncTopbarBottom);
  // The bar mounts pre-visible (opacity 0, translateY(-24px)) and only
  // animates in later via a transform/opacity transition once scrolled past
  // the header (see the .is-visible toggle below). ResizeObserver only
  // fires on box-size changes, never on that transform — so without this,
  // the very first (pre-visible) rect is what every docked heading reads,
  // permanently off by the entrance offset. Resync once the arrival
  // transition actually finishes.
  bar.addEventListener('transitionend', event => {
    if (event.propertyName === 'transform') syncTopbarBottom();
  });

  let activeSection = null;
  let indicatorFrame = null;
  let activeNavigation = null;
  const syncActiveIndicator = () => {
    indicatorFrame = null;
    const activeTab = activeSection && tabs.get(activeSection);
    if (!activeTab) return;

    const barRect = bar.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    bar.style.setProperty('--section-bar-indicator-x', (tabRect.left - barRect.left) + 'px');
    bar.style.setProperty('--section-bar-indicator-width', tabRect.width + 'px');
    bar.classList.add('has-active-indicator');
  };
  const setActiveSection = section => {
    if (!section || section === activeSection) return;
    activeSection = section;
    tabs.forEach((tab, target) => tab.classList.toggle('is-active', target === section));
    if (!indicatorFrame) indicatorFrame = requestAnimationFrame(syncActiveIndicator);
  };

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

  // The active tab is derived from the same document coordinate used for
  // navigation. This remains correct when Impact overlaps Journey and when
  // Journey changes height while roles are expanded or collapsed.
  let spyFrame = null;
  const syncScrollSpy = () => {
    spyFrame = null;
    // The timeline fold owns both layout and scroll position for a few
    // frames. Reading section geometry here would force unrelated layout
    // work immediately after its height write, while the active tab would
    // not convey useful information until that geometry is stable again.
    if (activeNavigation || document.body.classList.contains('is-timeline-folding')) return;

    const currentScroll = window.scrollY;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const isAtBottom = maxScroll > 0 && currentScroll >= maxScroll - 12;

    let nextSection = sections[0];
    sections.slice(1).forEach(section => {
      const target = getSectionViewportTarget(section);
      if (currentScroll + 1 >= target) nextSection = section;
    });

    if (isAtBottom) {
      nextSection = sections[sections.length - 1];
    }

    setActiveSection(nextSection);
  };
  const scheduleScrollSpy = () => {
    if (document.body.classList.contains('is-timeline-folding')) return;
    if (!spyFrame) spyFrame = requestAnimationFrame(syncScrollSpy);
  };
  const releaseNavigationSelection = () => {
    if (!activeNavigation) return;
    activeNavigation = null;
    scheduleScrollSpy();
  };
  window.addEventListener('scroll', scheduleScrollSpy, { passive: true });
  window.addEventListener('resize', scheduleScrollSpy, { passive: true });
  // The fold suppresses scrollspy only while it changes list geometry. One
  // explicit refresh afterwards replaces up to a frame's worth of measurements.
  window.addEventListener('timelinefoldend', scheduleScrollSpy);
  window.addEventListener('wheel', releaseNavigationSelection, { passive: true });
  window.addEventListener('touchstart', releaseNavigationSelection, { passive: true });
  document.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Space'].includes(event.code)) {
      releaseNavigationSelection();
    }
  });
  scheduleScrollSpy();

  function navigateToSection(section) {
    const target = getSectionViewportTarget(section);
    const navigation = { section };
    activeNavigation = navigation;
    setActiveSection(section);

    const finish = () => {
      if (activeNavigation !== navigation) return;
      // Keep the explicit selection through Lenis's final scroll events.
      // Direct manipulation is the only thing that hands control back to the
      // scrollspy (see releaseNavigationSelection above).
      navigation.settled = true;
      setActiveSection(section);
    };

    if (Math.abs(target - window.scrollY) <= 1) {
      finish();
    } else if (reduced) {
      window.scrollTo({ top: target, behavior: 'auto' });
      finish();
    } else if (getLenis()) {
      getLenis().scrollTo(target, {
        duration: duration,
        easing: easing,
        onComplete: finish,
      });
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
      const waitForTarget = () => {
        if (activeNavigation !== navigation) return;
        if (Math.abs(target - window.scrollY) <= 1) finish();
        else requestAnimationFrame(waitForTarget);
      };
      requestAnimationFrame(waitForTarget);
    }
  }
}

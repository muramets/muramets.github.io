/**
 * Canvas 2D Luminous Glow Engine for Journey Section.
 * Spans the ENTIRE Journey paper sheet (from page gutter to page gutter)
 * and extends down beneath Contact underlay (height 100% + --journey-contact-underlay-depth)
 * with dense Map Dot Grid overlay (fine micro-precise topographic dots fading radially under cursor).
 */
export function mountTimelineGlow({ surface, isFolding }) {
  const canUseGlow = surface && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!canUseGlow) return { destroy() {} };

  // Remove legacy DOM glow elements if present
  const legacyLayer = surface.querySelector('.timeline-glow-layer');
  if (legacyLayer) legacyLayer.remove();

  let canvas = surface.querySelector('.timeline-glow-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'timeline-glow-canvas';
    surface.prepend(canvas);
  }

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return { destroy() {} };

  const glowFollowTime = 70;
  let glowFrame = null;
  let lastGlowTime = 0;
  let lastPointer = null;
  let surfaceRect = null;
  let targetGlow = null;
  let currentGlow = null;
  let activeOpacity = 0;
  let targetOpacity = 0;

  let dpr = 1;
  let cssWidth = 0;
  let cssHeight = 0;

  const getUnderlayDepth = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--journey-contact-underlay-depth')
      .trim();
    if (raw) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return Math.max(420, window.innerHeight * 0.72);
  };

  const updateSurfaceRect = () => {
    surfaceRect = surface.getBoundingClientRect();
    cssWidth = surfaceRect.width;
    const underlayDepth = getUnderlayDepth();
    cssHeight = surfaceRect.height + underlayDepth;
  };

  const resizeCanvas = (force = false) => {
    updateSurfaceRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const pxWidth = Math.round(cssWidth * dpr);
    const pxHeight = Math.round(cssHeight * dpr);

    if (force || canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth;
      canvas.height = pxHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
  };

  const getGlowPoint = point => {
    const rect = surfaceRect || (surfaceRect = surface.getBoundingClientRect());
    return {
      x: point.x - rect.left,
      y: point.y - rect.top,
    };
  };

  const drawGlow = now => {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isFolding()) {
      targetOpacity = 0;
    }

    const opacityDiff = targetOpacity - activeOpacity;
    if (Math.abs(opacityDiff) > 0.001) {
      activeOpacity += opacityDiff * 0.14;
    } else {
      activeOpacity = targetOpacity;
    }

    if (activeOpacity <= 0.001 && targetOpacity === 0) {
      glowFrame = null;
      surface.classList.remove('is-timeline-exploring');
      return;
    }

    // Keep rect, canvas resolution and target position 100% 1:1 synced on every frame
    if (lastPointer) {
      updateSurfaceRect();
      resizeCanvas(false);
      targetGlow = getGlowPoint(lastPointer);
    }

    if (!currentGlow && targetGlow) {
      currentGlow = { ...targetGlow };
    }

    if (currentGlow && targetGlow) {
      const elapsed = lastGlowTime ? Math.min(64, now - lastGlowTime) : 16.7;
      const follow = 1 - Math.exp(-elapsed / glowFollowTime);
      currentGlow.x += (targetGlow.x - currentGlow.x) * follow;
      currentGlow.y += (targetGlow.y - currentGlow.y) * follow;
    }
    lastGlowTime = now;

    const posX = currentGlow ? currentGlow.x : cssWidth / 2;
    const posY = currentGlow ? currentGlow.y : cssHeight / 2;

    const fadeMarginX = Math.min(100, cssWidth * 0.10);
    const fadeMarginTop = 100;
    const fadeMarginBottom = 160;

    const distLeft = posX;
    const distRight = cssWidth - posX;
    const distTop = posY;
    const distBottom = cssHeight - posY;

    const normX = Math.max(0, Math.min(1, Math.min(distLeft, distRight) / fadeMarginX));
    const normTop = Math.max(0, Math.min(1, distTop / fadeMarginTop));
    const normBottom = Math.max(0, Math.min(1, distBottom / fadeMarginBottom));

    const smoothX = normX * normX * (3 - 2 * normX);
    const smoothY = Math.min(
      normTop * normTop * (3 - 2 * normTop),
      normBottom * normBottom * (3 - 2 * normBottom)
    );
    const edgeAlpha = Math.min(smoothX, smoothY);

    const finalAlpha = activeOpacity * edgeAlpha;

    if (finalAlpha > 0.001) {
      ctx.save();
      ctx.scale(dpr, dpr);

      const pulse = Math.sin(now * 0.0018) * 0.04;

      // Primary Core Aura
      const r1 = Math.min(420, cssWidth * 0.45) * (1 + pulse);
      const grad1 = ctx.createRadialGradient(posX, posY, 0, posX, posY, r1);
      grad1.addColorStop(0.00, `rgba(60, 255, 208, ${(0.34 * finalAlpha).toFixed(3)})`);
      grad1.addColorStop(0.22, `rgba(60, 255, 208, ${(0.24 * finalAlpha).toFixed(3)})`);
      grad1.addColorStop(0.48, `rgba(60, 255, 208, ${(0.11 * finalAlpha).toFixed(3)})`);
      grad1.addColorStop(0.72, `rgba(60, 255, 208, ${(0.03 * finalAlpha).toFixed(3)})`);
      grad1.addColorStop(1.00, 'rgba(60, 255, 208, 0)');

      ctx.fillStyle = grad1;
      ctx.beginPath();
      ctx.arc(posX, posY, r1, 0, Math.PI * 2);
      ctx.fill();

      // Secondary Offset Ambient Fill
      const secX = posX - 50;
      const secY = posY + 25;
      const r2 = Math.min(320, cssWidth * 0.38) * (1 - pulse);
      const grad2 = ctx.createRadialGradient(secX, secY, 0, secX, secY, r2);
      grad2.addColorStop(0.00, `rgba(60, 255, 208, ${(0.20 * finalAlpha).toFixed(3)})`);
      grad2.addColorStop(0.30, `rgba(60, 255, 208, ${(0.12 * finalAlpha).toFixed(3)})`);
      grad2.addColorStop(0.65, `rgba(60, 255, 208, ${(0.028 * finalAlpha).toFixed(3)})`);
      grad2.addColorStop(1.00, 'rgba(60, 255, 208, 0)');

      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(secX, secY, r2, 0, Math.PI * 2);
      ctx.fill();

      // Map Dot Grid (Dense Fine Micro-precise Topographic Dots)
      const dotStep = 16;
      const minX = Math.floor((posX - r1) / dotStep) * dotStep;
      const maxX = Math.ceil((posX + r1) / dotStep) * dotStep;
      const minY = Math.floor((posY - r1) / dotStep) * dotStep;
      const maxY = Math.ceil((posY + r1) / dotStep) * dotStep;

      for (let gx = minX; gx <= maxX; gx += dotStep) {
        for (let gy = minY; gy <= maxY; gy += dotStep) {
          const dist = Math.hypot(gx - posX, gy - posY);
          if (dist < r1) {
            const norm = 1 - dist / r1;
            const dotAlpha = norm * norm * finalAlpha;
            if (dotAlpha > 0.01) {
              const dotRadius = 0.50 + norm * 0.35;
              ctx.fillStyle = `rgba(25, 170, 140, ${(0.38 * dotAlpha).toFixed(3)})`;
              ctx.beginPath();
              ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.restore();
    }

    const isAnimating = Math.abs(targetOpacity - activeOpacity) > 0.001 ||
      (currentGlow && targetGlow && Math.hypot(targetGlow.x - currentGlow.x, targetGlow.y - currentGlow.y) > 0.1) ||
      (lastPointer !== null);

    if (isAnimating || targetOpacity > 0) {
      glowFrame = requestAnimationFrame(drawGlow);
    } else {
      glowFrame = null;
    }
  };

  const startAnimation = () => {
    if (!glowFrame) {
      lastGlowTime = performance.now();
      glowFrame = requestAnimationFrame(drawGlow);
    }
  };

  const setGlowTarget = point => {
    if (isFolding()) return;
    lastPointer = point;
    targetOpacity = 1;
    surface.classList.add('is-timeline-exploring');
    startAnimation();
  };

  const clearGlow = () => {
    targetOpacity = 0;
    lastPointer = null;
    startAnimation();
  };

  const onPointerEnter = event => {
    if (isFolding()) return;
    resizeCanvas(true);
    setGlowTarget({ x: event.clientX, y: event.clientY });
  };

  const onPointerMove = event => {
    if (!isFolding()) {
      setGlowTarget({ x: event.clientX, y: event.clientY });
    }
  };

  const onScroll = () => {
    if (isFolding()) {
      clearGlow();
      return;
    }
    if (lastPointer) {
      startAnimation();
    }
  };

  const onResize = () => {
    resizeCanvas(true);
    onScroll();
  };

  const onTransitionEnd = event => {
    if (event.target && event.target.classList && event.target.classList.contains('timeline-list')) {
      resizeCanvas(true);
    }
  };

  resizeCanvas(true);

  surface.addEventListener('pointerenter', onPointerEnter);
  surface.addEventListener('pointermove', onPointerMove, { passive: true });
  surface.addEventListener('pointerleave', clearGlow);
  surface.addEventListener('transitionend', onTransitionEnd);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('timelinefoldstart', clearGlow);
  window.addEventListener('resize', onResize, { passive: true });

  return {
    // The canvas spans surface height + underlay depth, measured once at
    // mount/hover/resize/transitionend. None of those fire when the timeline
    // list changes height programmatically (mount-time role hiding, or the
    // fold's rAF-driven height with `transition: none`), so the canvas can be
    // sized against a taller Journey than currently exists. That's real,
    // layout-affecting height on an absolutely-positioned element — it
    // inflates document.scrollHeight beyond what's actually visible. Callers
    // must force a remeasure right after any such height change.
    refresh() {
      resizeCanvas(true);
    },
    destroy() {
      clearGlow();
      if (glowFrame) cancelAnimationFrame(glowFrame);
      surface.removeEventListener('pointerenter', onPointerEnter);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerleave', clearGlow);
      surface.removeEventListener('transitionend', onTransitionEnd);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('timelinefoldstart', clearGlow);
      window.removeEventListener('resize', onResize);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

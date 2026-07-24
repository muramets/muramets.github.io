// The Impact gate's "press play" easter egg: a one-shot track tied to the
// gate button, handed off to a persistent corner control once launched.
// Scoped to about.html only for now — no cross-page persistence yet.

const TRACK_SRC = 'assets/audio/jesus-walks.mp3';
const TARGET_VOLUME = 0.15;
// Starting the ramp at 0 reads as a long dead-silence beat before anything
// happens — sound should be there the instant playback starts, then ease
// up to the target level rather than fading in from nothing.
const INTRO_VOLUME = TARGET_VOLUME * 0.20;
const VOLUME_FADE_MS = 10000;
const VOLUME_FADE_MARGIN_S = 10;
// Same arrive grammar the Impact cards themselves use (impact-card-surface-
// arrive/impact-card-content-arrive in css/layout.css) — a plain decelerate,
// no elastic overshoot, so the button reads as one more card settling in
// rather than a UI widget popping open.
const ARRIVE_EASE = 'cubic-bezier(0.22, 0.82, 0.28, 1)';
const RECEDE_EASE = 'cubic-bezier(0.6, 0, 0.9, 0.2)';

// Standard parametric cubic-bezier solver (Newton's method on the X curve),
// so the volume fade rides the exact same easing language as the motion
// above instead of a plain linear ramp.
function cubicBezier(x1, y1, x2, y2) {
  const bx = t => 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
  const by = t => 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  return x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = bx(t) - x;
      if (Math.abs(dx) < 1e-4) break;
      const d = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return by(t);
  };
}

// Fade-in starts from INTRO_VOLUME (audible immediately, no dead-silence
// beat) and eases the rest of the way to the target — quick initial
// movement, gentle settle. Fade-out mirrors it: quick initial drop, long
// gentle tail into silence, so the ending never reads as an abrupt cut.
const fadeInEase = cubicBezier(0.16, 1, 0.3, 1);
const fadeOutEase = cubicBezier(0.15, 1, 0.4, 1);

// The "01" label and the gate button live in separate panels but are meant
// to read as one composed block. Their left edges already share the same
// CSS inset, but the label's right edge only lines up with the button's
// text by coincidence of content length — so when an admin has set exactly
// two characters (like "01"), spread them to genuinely span from the
// icon's left edge to the text's right edge instead of leaving that to
// chance. Both elements share the identical scroll-driven transform, so a
// single measurement is transform-invariant regardless of scroll position.
function alignGateLabelToButton(gateBtn) {
  const shutterRight = document.querySelector('.scroll-chapter__shutter--right');
  const label = shutterRight?.querySelector('.scroll-chapter__shutter-label');
  const dot = gateBtn.querySelector('.vibe-gate-btn__dot');
  const text = gateBtn.querySelector('.vibe-gate-btn__text');
  if (!shutterRight || !label || !dot || !text) return;

  const raw = label.textContent.trim();
  if (raw.length !== 2) return;

  label.innerHTML = `<span>${raw[0]}</span><span>${raw[1]}</span>`;
  label.style.display = 'flex';
  label.style.justifyContent = 'space-between';

  const apply = () => {
    if (!matchMedia('(min-width: 901px)').matches) return;
    const shutterRect = shutterRight.getBoundingClientRect();
    const iconRect = dot.getBoundingClientRect();
    const textRect = text.getBoundingClientRect();
    label.style.left = `${iconRect.left - shutterRect.left}px`;
    label.style.width = `${textRect.right - iconRect.left}px`;
  };
  apply();
  window.addEventListener('resize', apply);
}

export function initVibePlayer() {
  const gateBtn = document.querySelector('.vibe-gate-btn');
  if (!gateBtn) return;

  alignGateLabelToButton(gateBtn);

  const audio = new Audio(TRACK_SRC);
  // iOS Safari ignores HTMLMediaElement.volume entirely (it's tied to the
  // hardware buttons there) — every fade below runs through a Web Audio
  // GainNode instead, which iOS does respect. The node can only be created
  // once, and only inside a user gesture, so it's built lazily on first tap.
  audio.preload = 'metadata';

  let audioCtx = null;
  let gainNode = null;
  const ensureAudioGraph = () => {
    if (gainNode) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    source.connect(gainNode).connect(audioCtx.destination);
  };

  // Loading only starts on tap otherwise (preload="none" territory), which
  // on a slow link is exactly the "button feels laggy" delay reported on
  // iPad — the tap itself is instant, but audio.play() sits waiting on the
  // network for a beat first. Buffering ahead of time once the gate is
  // actually in view removes that wait without fetching 6MB for visitors
  // who never scroll this far.
  const preloadObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    audio.preload = 'auto';
    audio.load();
    preloadObserver.disconnect();
  }, { rootMargin: '200% 0px' });
  preloadObserver.observe(gateBtn);

  let fadeToken = 0;
  const fadeVolume = (from, to, duration, ease) => {
    const token = ++fadeToken;
    return new Promise(resolve => {
      const start = performance.now();
      const step = now => {
        if (token !== fadeToken) return resolve();
        const x = Math.min((now - start) / duration, 1);
        if (gainNode) gainNode.gain.value = from + (to - from) * ease(x);
        if (x < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  };

  let fadingOut = false;
  audio.addEventListener('timeupdate', () => {
    if (fadingOut || !Number.isFinite(audio.duration)) return;
    if (audio.currentTime < audio.duration - VOLUME_FADE_MARGIN_S) return;
    fadingOut = true;
    fadeVolume(gainNode ? gainNode.gain.value : TARGET_VOLUME, 0, VOLUME_FADE_MS, fadeOutEase);
  });

  const player = document.createElement('button');
  player.type = 'button';
  player.className = 'vibe-player';
  player.setAttribute('aria-label', 'Pause the track');
  player.innerHTML = `
    <span class="vibe-player__icon" aria-hidden="true"></span>
    <span class="vibe-player__label">JESUS WALKS</span>
  `;
  document.body.append(player);

  const setPaused = paused => {
    player.classList.toggle('is-paused', paused);
    player.setAttribute('aria-label', paused ? 'Play the track' : 'Pause the track');
  };

  const launch = async () => {
    gateBtn.disabled = true;
    const ring = gateBtn.querySelector('.vibe-gate-btn__ring');

    // The button's resting transform is a scroll-driven CSS animation (it
    // rides the door's own translateX). Freezing that exact matrix here and
    // prefixing every keyframe with it means the launch plays from wherever
    // the door left it, instead of snapping to an untransformed origin.
    const restingTransform = getComputedStyle(gateBtn).transform;
    if (restingTransform !== 'none') {
      gateBtn.style.transform = restingTransform;
    }
    gateBtn.style.animation = 'none';
    gateBtn.classList.add('is-launching');

    const prefix = restingTransform === 'none' ? '' : `${restingTransform} `;
    const at = (y, scale) => `${prefix}translateY(${y}px) scale(${scale})`;

    // ensureAudioGraph() and the resume()/play() calls below must all be
    // reachable synchronously from this tap for iOS to treat the audio as
    // gesture-initiated — but the promise itself is awaited later, after
    // the grow animation, so the tap's visual response never waits on
    // network/decode latency first.
    ensureAudioGraph();
    const audioReady = (async () => {
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audio.currentTime = 0;
      gainNode.gain.value = INTRO_VOLUME;
      await audio.play();
      fadeVolume(INTRO_VOLUME, TARGET_VOLUME, VOLUME_FADE_MS, fadeInEase);
    })();

    // Phase 1: grow toward the viewer in place.
    await gateBtn.animate(
      [{ transform: at(0, 1) }, { transform: at(0, 1.25) }],
      { duration: 250, easing: ARRIVE_EASE, fill: 'forwards' },
    ).finished;

    // The track is already playing by now — swap the gate icon to pause
    // before it vanishes, so the handoff to the corner control (which opens
    // already showing pause) doesn't read as two different play states.
    gateBtn.classList.add('is-playing');

    // Phase 2: shrink back into a single point in place.
    await gateBtn.animate(
      [
        { transform: at(0, 1.25), opacity: 1 },
        { transform: at(0, 0), opacity: 0 },
      ],
      { duration: 280, easing: RECEDE_EASE, fill: 'forwards' },
    ).finished;

    try {
      await audioReady;
    } catch {
      // Autoplay/decoding refused after all — restore the gate button
      // instead of handing off to a corner control for a track that never
      // actually started.
      gateBtn.style.transform = '';
      gateBtn.style.animation = '';
      gateBtn.classList.remove('is-launching', 'is-playing');
      gateBtn.disabled = false;
      return;
    }

    gateBtn.style.display = 'none';
    if (ring) ring.style.animation = 'none';

    // Phase 3: the corner control rises into place from the same collapsed
    // state, arriving with the identical card-style decelerate.
    player.classList.add('is-visible');
    player.animate(
      [
        { transform: 'translateY(14px) scale(0)' },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 420, easing: ARRIVE_EASE },
    );
  };

  gateBtn.addEventListener('click', () => { launch(); }, { once: true });

  player.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  });

  audio.addEventListener('play', () => setPaused(false));
  audio.addEventListener('pause', () => setPaused(true));
  audio.addEventListener('ended', () => setPaused(true));
}

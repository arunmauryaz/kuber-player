// ─────────────────────────────────────────────────────────────────────────────
// Kuber Player — Custom Controls Overlay
// Features: skip ±10s, PiP, speed menu, progress bar, volume,
//           fullscreen, resume toast, auto-hide, keyboard + mobile gestures
// ─────────────────────────────────────────────────────────────────────────────

export interface SavedProgress { time: number; duration: number; pct: number; }

export interface ControlsOptions {
  videoId:          string;
  savedProgress:    SavedProgress | null;
  onSaveProgress?:  (time: number, duration: number) => void;
  onClearProgress?: () => void;
  onEnded?:         () => void;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const I = {
  play:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause:  `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  back10: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2L7 7l5 5V8c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/><text x="12" y="14" text-anchor="middle" font-size="5" font-weight="bold" fill="currentColor">10</text></svg>`,
  fwd10:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2l5 5-5 5V8c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h2c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8z"/><text x="12" y="14" text-anchor="middle" font-size="5" font-weight="bold" fill="currentColor">10</text></svg>`,
  volHi:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`,
  volLo:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07"/></svg>`,
  volX:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>`,
  fs:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>`,
  fsExit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 20l6-6M4 4l6 6"/></svg>`,
  pip:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1"/></svg>`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

// ─── Build HTML ───────────────────────────────────────────────────────────────
function buildHTML(): string {
  return `
<div class="k-controls" id="k-controls" tabindex="-1">
  <!-- Resume banner -->
  <div class="k-resume-banner" id="k-resume" style="display:none">
    <span class="k-resume-text" id="k-resume-text">Resuming from <strong id="k-resume-time"></strong></span>
    <button class="k-resume-btn k-resume-start" id="k-start-over">Start Over</button>
  </div>

  <!-- Top gradient -->
  <div class="k-grad k-grad-top"></div>

  <!-- Ripple for double-tap skip -->
  <div class="k-ripple k-ripple-left"  id="k-rip-left">
    <div class="k-rip-icon">${I.back10}<span>-10s</span></div>
  </div>
  <div class="k-ripple k-ripple-right" id="k-rip-right">
    <div class="k-rip-icon">${I.fwd10}<span>+10s</span></div>
  </div>

  <!-- Center controls -->
  <div class="k-center" id="k-center">
    <button class="k-ctr-btn" id="k-skip-back" title="Back 10s (←)">
      ${I.back10}<span class="k-ctr-label">10s</span>
    </button>
    <button class="k-ctr-btn k-ctr-play" id="k-play-ctr" title="Play / Pause (Space)">
      ${I.play}
    </button>
    <button class="k-ctr-btn" id="k-skip-fwd" title="Forward 10s (→)">
      ${I.fwd10}<span class="k-ctr-label">10s</span>
    </button>
  </div>

  <!-- Bottom gradient + bar -->
  <div class="k-grad k-grad-bot"></div>
  <div class="k-bottom" id="k-bottom">

    <!-- Progress bar -->
    <div class="k-prog-wrap" id="k-prog-wrap">
      <div class="k-prog-bg" id="k-prog-bg">
        <div class="k-prog-buf" id="k-prog-buf"></div>
        <div class="k-prog-fill" id="k-prog-fill"></div>
        <div class="k-prog-dot"  id="k-prog-dot"></div>
      </div>
      <div class="k-prog-time-tip" id="k-tip">0:00</div>
    </div>

    <!-- Controls row -->
    <div class="k-row">
      <div class="k-row-left">
        <button class="k-btn" id="k-play-btn" title="Play / Pause (Space)">${I.play}</button>
        <div class="k-vol-wrap">
          <button class="k-btn" id="k-vol-btn" title="Mute (M)">${I.volHi}</button>
          <input class="k-vol-range" id="k-vol-range" type="range" min="0" max="1" step="0.02" value="1">
        </div>
        <span class="k-time" id="k-time">0:00 / --:--</span>
      </div>
      <div class="k-row-right">
        <!-- Speed -->
        <div class="k-speed-wrap">
          <button class="k-btn k-speed-btn" id="k-speed-btn" title="Playback Speed">1×</button>
          <div class="k-speed-menu" id="k-speed-menu">
            ${[0.25,0.5,0.75,1,1.25,1.5,1.75,2].map(s =>
              `<button class="k-speed-opt${s===1?' active':''}" data-speed="${s}">${s}×</button>`
            ).join('')}
          </div>
        </div>
        <!-- PiP -->
        <button class="k-btn" id="k-pip-btn" title="Picture in Picture (P)">${I.pip}</button>
        <!-- Fullscreen -->
        <button class="k-btn" id="k-fs-btn" title="Fullscreen (F)">${I.fs}</button>
      </div>
    </div>

  </div><!-- /k-bottom -->
</div><!-- /k-controls -->`;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function injectPlayerControls(
  container: HTMLElement,
  videoEl:   HTMLVideoElement,
  opts:      ControlsOptions
): () => void {
  videoEl.controls = false;

  container.insertAdjacentHTML('beforeend', buildHTML());

  // Element refs
  const ctrl        = container.querySelector<HTMLElement>('#k-controls')!;
  const resumeBanner= ctrl.querySelector<HTMLElement>('#k-resume')!;
  const resumeText  = ctrl.querySelector<HTMLElement>('#k-resume-time')!;
  const startOverBtn= ctrl.querySelector<HTMLButtonElement>('#k-start-over')!;
  const playCtr     = ctrl.querySelector<HTMLButtonElement>('#k-play-ctr')!;
  const skipBack    = ctrl.querySelector<HTMLButtonElement>('#k-skip-back')!;
  const skipFwd     = ctrl.querySelector<HTMLButtonElement>('#k-skip-fwd')!;
  const playBtn     = ctrl.querySelector<HTMLButtonElement>('#k-play-btn')!;
  const volBtn      = ctrl.querySelector<HTMLButtonElement>('#k-vol-btn')!;
  const volRange    = ctrl.querySelector<HTMLInputElement>('#k-vol-range')!;
  const timeEl      = ctrl.querySelector<HTMLElement>('#k-time')!;
  const progWrap    = ctrl.querySelector<HTMLElement>('#k-prog-wrap')!;
  const progBg      = ctrl.querySelector<HTMLElement>('#k-prog-bg')!;
  const progFill    = ctrl.querySelector<HTMLElement>('#k-prog-fill')!;
  const progBuf     = ctrl.querySelector<HTMLElement>('#k-prog-buf')!;
  const progDot     = ctrl.querySelector<HTMLElement>('#k-prog-dot')!;
  const timeTip     = ctrl.querySelector<HTMLElement>('#k-tip')!;
  const speedBtn    = ctrl.querySelector<HTMLButtonElement>('#k-speed-btn')!;
  const speedMenu   = ctrl.querySelector<HTMLElement>('#k-speed-menu')!;
  const pipBtn      = ctrl.querySelector<HTMLButtonElement>('#k-pip-btn')!;
  const fsBtn       = ctrl.querySelector<HTMLButtonElement>('#k-fs-btn')!;
  const ripL        = ctrl.querySelector<HTMLElement>('#k-rip-left')!;
  const ripR        = ctrl.querySelector<HTMLElement>('#k-rip-right')!;

  // ── State ────────────────────────────────────────────────────────────────
  let hideTimer:     ReturnType<typeof setTimeout>;
  let isSeeking      = false;
  let isVisible      = true;
  let progTimer:     ReturnType<typeof setInterval> | null = null;
  let resumeDismiss: ReturnType<typeof setTimeout> | null = null;

  // ── Auto-hide ─────────────────────────────────────────────────────────────
  function showControls(): void {
    ctrl.classList.add('k-visible');
    isVisible = true;
    clearTimeout(hideTimer);
  }
  function scheduleHide(): void {
    clearTimeout(hideTimer);
    if (!videoEl.paused) {
      hideTimer = setTimeout(() => {
        ctrl.classList.remove('k-visible');
        isVisible = false;
      }, 3000);
    }
  }
  function toggleVisibility(): void {
    if (isVisible && !videoEl.paused) {
      ctrl.classList.remove('k-visible');
      isVisible = false;
      clearTimeout(hideTimer);
    } else {
      showControls();
      scheduleHide();
    }
  }

  showControls();

  ctrl.addEventListener('mousemove',  () => { showControls(); scheduleHide(); });
  ctrl.addEventListener('mouseleave', () => scheduleHide());
  ctrl.addEventListener('touchstart', () => { showControls(); scheduleHide(); }, { passive: true });

  // ── Play / Pause ──────────────────────────────────────────────────────────
  function updatePlayIcon(): void {
    const icon = videoEl.paused ? I.play : I.pause;
    playCtr.innerHTML  = icon;
    playBtn.innerHTML  = icon;
  }

  function togglePlay(): void {
    if (videoEl.paused) videoEl.play().catch(() => {});
    else                 videoEl.pause();
    showControls(); scheduleHide();
  }

  videoEl.addEventListener('click',  togglePlay);
  playCtr.addEventListener('click',  (e) => { e.stopPropagation(); togglePlay(); });
  playBtn.addEventListener('click',  (e) => { e.stopPropagation(); togglePlay(); });
  videoEl.addEventListener('play',   () => { updatePlayIcon(); scheduleHide(); });
  videoEl.addEventListener('pause',  () => { updatePlayIcon(); showControls(); });
  videoEl.addEventListener('ended',  () => { updatePlayIcon(); showControls(); });

  // ── Skip ±10s ─────────────────────────────────────────────────────────────
  function skip(delta: number): void {
    videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 0, videoEl.currentTime + delta));
    showControls(); scheduleHide();
  }

  skipBack.addEventListener('click', (e) => { e.stopPropagation(); triggerRipple('left'); skip(-10); });
  skipFwd.addEventListener( 'click', (e) => { e.stopPropagation(); triggerRipple('right'); skip(10); });

  // ── Ripple for mobile double-tap ──────────────────────────────────────────
  function triggerRipple(side: 'left' | 'right'): void {
    const el = side === 'left' ? ripL : ripR;
    el.classList.remove('k-rip-show');
    void el.offsetWidth; // reflow
    el.classList.add('k-rip-show');
    setTimeout(() => el.classList.remove('k-rip-show'), 600);
  }

  // Mobile double-tap zone
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  let tapCount = 0;
  ctrl.addEventListener('touchend', (e) => {
    const x = (e.changedTouches[0]?.clientX ?? 0);
    const mid = ctrl.getBoundingClientRect().left + ctrl.offsetWidth / 2;
    const side = x < mid ? 'left' : 'right';
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (tapCount >= 2) {
        if (side === 'left')  { triggerRipple('left');  skip(-10); }
        else                  { triggerRipple('right'); skip(10);  }
      } else {
        toggleVisibility();
      }
      tapCount = 0;
    }, 280);
  });

  // ── Progress bar ──────────────────────────────────────────────────────────
  function updateProgress(): void {
    const d = videoEl.duration;
    const t = videoEl.currentTime;
    if (!isFinite(d) || d <= 0) return;
    const pct = (t / d) * 100;
    progFill.style.width = `${pct}%`;
    progDot.style.left   = `${pct}%`;
    timeEl.textContent   = `${fmt(t)} / ${fmt(d)}`;

    // Buffered
    const buf = videoEl.buffered;
    for (let i = 0; i < buf.length; i++) {
      if (t >= buf.start(i) && t <= buf.end(i)) {
        progBuf.style.width = `${(buf.end(i) / d) * 100}%`;
        break;
      }
    }

    // Progress save
    opts.onSaveProgress?.(t, d);
  }

  videoEl.addEventListener('timeupdate', updateProgress);
  videoEl.addEventListener('progress',   updateProgress);

  // Seek on click/drag
  function seekFromEvent(e: MouseEvent | Touch): void {
    const rect = progBg.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = pct * (videoEl.duration || 0);
  }

  progWrap.addEventListener('mousedown', (e) => {
    isSeeking = true;
    seekFromEvent(e);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => { if (isSeeking) seekFromEvent(e); });
  window.addEventListener('mouseup',   () => { isSeeking = false; });

  // Touch seek
  progWrap.addEventListener('touchstart', (e) => { isSeeking = true; seekFromEvent(e.touches[0]); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchmove',  (e) => { if (isSeeking) seekFromEvent(e.touches[0]); }, { passive: true });
  window.addEventListener('touchend',   () => { isSeeking = false; });

  // Hover time tip
  progWrap.addEventListener('mousemove', (e) => {
    const rect = progBg.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t    = pct * (videoEl.duration || 0);
    timeTip.textContent  = fmt(t);
    timeTip.style.left   = `${pct * 100}%`;
    timeTip.style.opacity = '1';
  });
  progWrap.addEventListener('mouseleave', () => { timeTip.style.opacity = '0'; });

  // ── Volume ────────────────────────────────────────────────────────────────
  function updateVolIcon(): void {
    const v = videoEl.volume;
    const m = videoEl.muted;
    volBtn.innerHTML = (m || v === 0) ? I.volX : v < 0.5 ? I.volLo : I.volHi;
  }

  volRange.addEventListener('input', () => {
    videoEl.volume = parseFloat(volRange.value);
    videoEl.muted  = false;
    updateVolIcon();
  });
  volBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    videoEl.muted = !videoEl.muted;
    volRange.value = videoEl.muted ? '0' : String(videoEl.volume);
    updateVolIcon();
  });
  videoEl.addEventListener('volumechange', () => {
    volRange.value = videoEl.muted ? '0' : String(videoEl.volume);
    updateVolIcon();
  });

  // ── Speed ─────────────────────────────────────────────────────────────────
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu.classList.toggle('k-open');
  });
  speedMenu.querySelectorAll<HTMLButtonElement>('.k-speed-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = parseFloat(btn.dataset.speed!);
      videoEl.playbackRate = s;
      speedBtn.textContent = `${s}×`;
      speedMenu.querySelectorAll('.k-speed-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      speedMenu.classList.remove('k-open');
    });
  });
  document.addEventListener('click', () => speedMenu.classList.remove('k-open'));
  speedMenu.addEventListener('click', e => e.stopPropagation());

  // ── Picture in Picture ────────────────────────────────────────────────────
  if (!document.pictureInPictureEnabled) {
    pipBtn.style.display = 'none';
  } else {
    pipBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else                                  await videoEl.requestPictureInPicture();
      } catch (_) {}
    });
    videoEl.addEventListener('enterpictureinpicture', () => pipBtn.classList.add('k-active'));
    videoEl.addEventListener('leavepictureinpicture', () => pipBtn.classList.remove('k-active'));
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) container.requestFullscreen().catch(() => {});
    else                              document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.innerHTML = document.fullscreenElement ? I.fsExit : I.fs;
  });

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent): void {
    // Don't intercept if an input is focused
    if (['INPUT','SELECT','TEXTAREA'].includes((document.activeElement?.tagName || ''))) return;
    switch (e.code) {
      case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft':  e.preventDefault(); skip(-10); break;
      case 'ArrowRight': e.preventDefault(); skip(10);  break;
      case 'ArrowUp':    e.preventDefault(); videoEl.volume = Math.min(1, videoEl.volume + 0.1); updateVolIcon(); break;
      case 'ArrowDown':  e.preventDefault(); videoEl.volume = Math.max(0, videoEl.volume - 0.1); updateVolIcon(); break;
      case 'KeyM':       e.preventDefault(); videoEl.muted = !videoEl.muted; updateVolIcon(); break;
      case 'KeyF':       e.preventDefault(); fsBtn.click(); break;
      case 'KeyP':       e.preventDefault(); pipBtn.click(); break;
    }
  }
  document.addEventListener('keydown', onKey);

  // ── Ended callback ────────────────────────────────────────────────────────
  videoEl.addEventListener('ended', () => {
    opts.onClearProgress?.();
    opts.onEnded?.();
  });

  // ── Resume Banner ─────────────────────────────────────────────────────────
  if (opts.savedProgress && opts.savedProgress.pct > 2 && opts.savedProgress.pct < 96) {
    const savedTime = opts.savedProgress.time;
    resumeText.textContent = fmt(savedTime);
    resumeBanner.style.display = 'flex';

    // Auto-seek to saved position once metadata is loaded
    function doResume(): void {
      videoEl.currentTime = savedTime;
    }
    if (videoEl.readyState >= 1) doResume();
    else videoEl.addEventListener('loadedmetadata', doResume, { once: true });

    // Auto-dismiss banner after 5 seconds
    resumeDismiss = setTimeout(() => { resumeBanner.style.display = 'none'; }, 5000);

    startOverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (resumeDismiss) clearTimeout(resumeDismiss);
      videoEl.currentTime = 0;
      opts.onClearProgress?.();
      resumeBanner.style.display = 'none';
    });
  }

  // ── Initial state ─────────────────────────────────────────────────────────
  updateVolIcon();
  updatePlayIcon();

  // ── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    document.removeEventListener('keydown', onKey);
    if (progTimer)    clearInterval(progTimer);
    if (resumeDismiss) clearTimeout(resumeDismiss);
    clearTimeout(hideTimer);
    ctrl.remove();
  };
}

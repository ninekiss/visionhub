(() => {
  "use strict";

  // Runs in MAIN world and activates only after the isolated extension script
  // accepts a trusted VisionHub player session.
  const CHANNEL = "visionhub-source-progress-v1";
  const FOCUS_RETURN_GRACE_MS = 2200;
  const states = new Map();
  let enabled = false;
  let lastBlurAt = 0;
  let observer = null;

  const PLAYER_TOGGLE_SELECTOR = [
    "[data-plyr='play']", "[data-plyr='pause']",
    ".plyr__control[aria-label*='play' i]", ".plyr__control[title*='play' i]",
    ".vjs-play-control", ".dplayer-play-icon", ".dplayer-pause-icon",
    ".jw-icon-playback", "[class*='play-pause']", "[class*='playPause']",
    "button[aria-label*='pause' i]", "button[title*='pause' i]",
    "button[aria-label*='play' i]", "button[title*='play' i]",
    "[role='button'][aria-label*='pause' i]", "[role='button'][aria-label*='play' i]"
  ].join(", ");
  const VIDEO_SURFACE_SELECTOR = [
    ".plyr__video-wrapper", ".dplayer-video-wrap", ".vjs-tech",
    ".jw-video", ".artplayer-video", ".xgplayer-video",
    ".bpx-player-video-wrap", ".prism-player"
  ].join(", ");

  function playerFor(video) {
    try {
      if (video.plyr && typeof video.plyr === "object") return video.plyr;
      const root = video.closest(".plyr");
      if (root && root.plyr && typeof root.plyr === "object") return root.plyr;
    } catch {}
    return null;
  }

  function readTime(video) {
    const player = playerFor(video);
    try {
      if (player && Number.isFinite(Number(player.currentTime))) return Number(player.currentTime);
    } catch {}
    return Number.isFinite(video.currentTime) ? video.currentTime : 0;
  }

  function setTime(video, value) {
    if (!Number.isFinite(value) || value < 0) return;
    const player = playerFor(video);
    if (player) {
      try {
        if (Number.isFinite(Number(player.currentTime))) {
          player.currentTime = value;
          if (Math.abs(readTime(video) - value) <= 3) return;
        }
      } catch {}
    }
    try { video.currentTime = value; } catch {}
  }

  function playVideo(video) {
    const player = playerFor(video);
    let result;
    let invokedPlayer = false;
    try {
      if (player && typeof player.play === "function") {
        result = player.play();
        invokedPlayer = true;
      }
    } catch {}
    if (!invokedPlayer) {
      try { result = video.play(); } catch { result = null; }
    }
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        try {
          const fallback = video.play();
          if (fallback && typeof fallback.catch === "function") fallback.catch(() => {});
        } catch {}
      });
    }
  }

  function stateFor(video) {
    let state = states.get(video);
    if (state) return state;
    const currentTime = readTime(video);
    state = {
      video,
      lastTime: currentTime > 0 ? currentTime : 0,
      timeAtBlur: 0,
      lastKnownPlaying: !video.paused && !video.ended,
      wasPlayingAtBlur: false,
      pausedByFocusLoss: false,
      suppressBlurPause: false,
      focusRecoveryUntil: 0,
      manualPauseIntentUntil: 0,
      focusCycleId: 0,
      attached: false
    };
    states.set(video, state);
    return state;
  }

  function attachEvents(state) {
    const video = state.video;
    if (state.attached) return;
    state.attached = true;

    video.addEventListener("timeupdate", () => {
      const now = readTime(video);
      if (Number.isFinite(now) && now >= 0 &&
          !(state.suppressBlurPause && state.wasPlayingAtBlur && now < 2 && state.lastTime > 3)) {
        state.lastTime = now;
      }
      if (!video.paused && !video.ended) state.lastKnownPlaying = true;
    }, true);

    video.addEventListener("seeked", () => {
      const now = readTime(video);
      if (Number.isFinite(now) && now >= 0) state.lastTime = now;
    }, true);

    video.addEventListener("playing", () => {
      state.lastTime = readTime(video);
      state.lastKnownPlaying = true;
      state.wasPlayingAtBlur = false;
      state.pausedByFocusLoss = false;
      state.suppressBlurPause = false;
      state.manualPauseIntentUntil = 0;
    }, true);

    video.addEventListener("pause", () => {
      const now = Date.now();
      state.lastKnownPlaying = false;

      if (state.manualPauseIntentUntil >= now) {
        state.wasPlayingAtBlur = false;
        state.pausedByFocusLoss = false;
        state.suppressBlurPause = false;
        state.focusCycleId += 1;
        return;
      }

      const inFocusTransition = state.wasPlayingAtBlur &&
        state.suppressBlurPause &&
        (document.hidden || !document.hasFocus() || now <= state.focusRecoveryUntil);
      if (inFocusTransition && !video.ended) {
        state.pausedByFocusLoss = true;
        if (!document.hidden && document.hasFocus()) scheduleFocusRecovery(state);
      } else if (!state.wasPlayingAtBlur) {
        state.pausedByFocusLoss = false;
        state.suppressBlurPause = false;
      }
    }, true);
  }

  // Many source sites explicitly call video.pause() from their window-blur or
  // visibilitychange handlers. Install this hook before the site scripts run;
  // once the trusted extension session is enabled, suppress only those calls
  // belonging to a video that was playing when focus was lost.
  function installPauseHook() {
    const prototype = HTMLMediaElement.prototype;
    const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, "pause");
    const originalPause = originalDescriptor?.value;
    if (typeof originalPause !== "function" || prototype.__vhSourceFocusPauseHookV2) return;
    try {
      Object.defineProperty(prototype, "__vhSourceFocusPauseHookV2", {
        value: true, configurable: false, enumerable: false, writable: false
      });
      Object.defineProperty(prototype, "pause", {
        ...originalDescriptor,
        value: function (...args) {
          const state = states.get(this);
          const now = Date.now();
          const manualPause = state && state.manualPauseIntentUntil >= now;
          const shouldSuppress = enabled && state && state.suppressBlurPause &&
            state.wasPlayingAtBlur && !this.ended && !manualPause &&
            (document.hidden || !document.hasFocus() || now <= state.focusRecoveryUntil);
          if (shouldSuppress) return;
          return Reflect.apply(originalPause, this, args);
        }
      });
    } catch {
      // If the browser makes the native method non-configurable, focus recovery
      // below remains available as a fallback.
    }
  }

  function findPlayerRoot(video) {
    return video.closest([
      ".plyr", ".dplayer", ".video-js", ".jwplayer", ".artplayer-app",
      ".xgplayer", ".bpx-player-container", ".prism-player",
      "[class*='video-player']", "[class*='VideoPlayer']", "[class*='player-container']"
    ].join(", "));
  }

  function targetIsInPlayer(target, video) {
    if (!(target instanceof Element)) return false;
    const root = findPlayerRoot(video);
    if (root && root.contains(target)) return true;
    return target === video || Boolean(target.closest(VIDEO_SURFACE_SELECTOR));
  }

  function markManualPauseIntent(event) {
    if (!enabled) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const toggle = target.closest(PLAYER_TOGGLE_SELECTOR);
    const videoSurface = target === event.currentTarget ||
      Boolean(target.closest(VIDEO_SURFACE_SELECTOR));
    const key = event.type === "keydown" &&
      (event.code === "Space" || ["k", "K"].includes(event.key));

    for (const state of states.values()) {
      const video = state.video;
      if (video.paused || video.ended) continue;
      const inPlayer = targetIsInPlayer(target, video);
      if ((toggle && inPlayer) || (videoSurface && inPlayer) || (key && inPlayer)) {
        // The page-level pause hook must never swallow an intentional in-player pause.
        state.manualPauseIntentUntil = Date.now() + 1500;
      }
    }
  }

  function scanVideos() {
    if (!enabled) return;
    for (const video of document.querySelectorAll("video")) {
      if (!(video instanceof HTMLVideoElement)) continue;
      const state = stateFor(video);
      attachEvents(state);
      if (!video.paused && !video.ended) {
        state.lastTime = readTime(video);
        state.lastKnownPlaying = true;
      }
    }
  }

  function noteFocusLoss() {
    const now = Date.now();
    if (lastBlurAt > 0 && now - lastBlurAt < 1200) return;
    lastBlurAt = now;
    for (const state of states.values()) {
      const video = state.video;
      // Use event-maintained playback state as well as paused, because the site's
      // own blur handler may pause the media immediately after this listener runs.
      const wasPlaying = (!video.paused && !video.ended) || state.lastKnownPlaying;
      state.wasPlayingAtBlur = wasPlaying;
      state.pausedByFocusLoss = false;
      state.suppressBlurPause = wasPlaying;
      state.focusRecoveryUntil = 0;
      state.manualPauseIntentUntil = 0;
      state.focusCycleId += 1;
      const currentTime = readTime(video);
      state.timeAtBlur = Number.isFinite(currentTime) ? currentTime : state.lastTime;
      if (state.timeAtBlur > 0) state.lastTime = state.timeAtBlur;
    }
  }

  function recoverIfNeeded(state, cycleId) {
    if (cycleId !== state.focusCycleId || !enabled || document.hidden || !document.hasFocus()) return;
    const video = state.video;
    if (!state.wasPlayingAtBlur || state.manualPauseIntentUntil >= Date.now() ||
        !video.isConnected || video.ended) return;

    if (!video.paused) {
      state.lastTime = readTime(video);
      state.lastKnownPlaying = true;
      return;
    }

    state.pausedByFocusLoss = true;
    const target = state.lastTime > 0 ? state.lastTime : state.timeAtBlur;
    const currentTime = readTime(video);
    if (Number.isFinite(target) && target >= 0 &&
        Number.isFinite(video.duration) && target < video.duration - 0.5 &&
        Math.abs(currentTime - target) > 3) {
      setTime(video, target);
    }
    playVideo(video);
  }

  function scheduleFocusRecovery(state) {
    if (!state.wasPlayingAtBlur || document.hidden || !document.hasFocus()) return;
    const cycleId = state.focusCycleId;
    for (const delay of [0, 100, 300, 700, 1300, FOCUS_RETURN_GRACE_MS]) {
      window.setTimeout(() => recoverIfNeeded(state, cycleId), delay);
    }
    window.setTimeout(() => {
      if (cycleId !== state.focusCycleId) return;
      if (!state.video.paused || state.manualPauseIntentUntil >= Date.now()) {
        state.wasPlayingAtBlur = false;
        state.pausedByFocusLoss = false;
        state.suppressBlurPause = false;
        return;
      }
      // Final fallback in case the pause event was delivered after focus returned.
      recoverIfNeeded(state, cycleId);
    }, FOCUS_RETURN_GRACE_MS + 100);
  }

  function resumeAfterFocus() {
    if (!enabled || document.hidden) return;
    const now = Date.now();
    for (const state of states.values()) {
      if (!state.wasPlayingAtBlur) continue;
      state.focusRecoveryUntil = now + FOCUS_RETURN_GRACE_MS;
      scheduleFocusRecovery(state);
    }
  }

  installPauseHook();

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || !message || typeof message !== "object" ||
        message.channel !== CHANNEL || message.type !== "bridge-enable") return;
    enabled = true;
    scanVideos();
    if (!observer) {
      observer = new MutationObserver(() => scanVideos());
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    }
  });

  window.addEventListener("pointerdown", markManualPauseIntent, true);
  window.addEventListener("keydown", markManualPauseIntent, true);
  window.addEventListener("blur", noteFocusLoss, true);
  window.addEventListener("focus", resumeAfterFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) noteFocusLoss();
    else resumeAfterFocus();
  }, true);
})();
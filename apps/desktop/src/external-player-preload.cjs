const { contextBridge, webFrame } = require("electron");

function installExternalPlayerFocusGuard() {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" ||
      typeof HTMLMediaElement === "undefined") return false;

  const prototype = HTMLMediaElement.prototype;
  const marker = "__visionHubDesktopSourceFocusGuardV1";
  if (prototype[marker] === true) return true;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "pause");
  const nativePause = descriptor && descriptor.value;
  if (typeof nativePause !== "function" || descriptor.configurable !== true) return false;

  const GRACE_MS = 2400;
  const RETRY_DELAYS = [0, 100, 250, 500, 900, 1500, 2200];
  const states = new Map();
  let observer = null;
  let pageBlurred = false;
  let lastBlurAt = 0;

  const PLAYER_ROOTS = [
    ".plyr", ".dplayer", ".video-js", ".jwplayer", ".artplayer-app",
    ".xgplayer", ".bpx-player-container", ".prism-player",
    "[class*='video-player']", "[class*='VideoPlayer']", "[class*='player-container']"
  ].join(", ");
  const PLAYER_SURFACES = [
    ".plyr__video-wrapper", ".dplayer-video-wrap", ".vjs-tech",
    ".jw-video", ".artplayer-video", ".xgplayer-video",
    ".bpx-player-video-wrap", ".prism-player"
  ].join(", ");
  const PLAY_PAUSE_CONTROLS = [
    "[data-plyr='play']", "[data-plyr='pause']", ".plyr__control--overlaid",
    ".dplayer-play-icon", ".dplayer-pause-icon", ".jw-icon-playback", ".vjs-play-control",
    "button[aria-label^='play' i]", "button[aria-label*='pause' i]",
    "button[title^='play' i]", "button[title*='pause' i]",
    "[role='button'][aria-label^='play' i]", "[role='button'][aria-label*='pause' i]"
  ].join(", ");

  function playerFor(video) {
    try {
      if (video.plyr && typeof video.plyr === "object") return video.plyr;
      const root = video.closest(".plyr");
      if (root && root.plyr && typeof root.plyr === "object") return root.plyr;
    } catch {}
    return null;
  }

  function currentTime(video) {
    const player = playerFor(video);
    try {
      if (player && Number.isFinite(Number(player.currentTime))) return Number(player.currentTime);
    } catch {}
    return Number.isFinite(video.currentTime) ? video.currentTime : 0;
  }

  function sourceOf(video) {
    return video.currentSrc || video.src || "";
  }

  function seekTo(video, target) {
    if (!Number.isFinite(target) || target < 0 ||
        !Number.isFinite(video.duration) || target >= video.duration - 0.5) return;
    const player = playerFor(video);
    if (player) {
      try {
        if (Number.isFinite(Number(player.currentTime))) {
          player.currentTime = target;
          if (Math.abs(currentTime(video) - target) <= 3) return;
        }
      } catch {}
    }
    try { video.currentTime = target; } catch {}
  }

  function play(video) {
    const player = playerFor(video);
    let result;
    let usedPlayerApi = false;
    try {
      if (player && typeof player.play === "function") {
        result = player.play();
        usedPlayerApi = true;
      }
    } catch {}
    if (!usedPlayerApi) {
      try { result = video.play(); } catch { result = null; }
    }
    if (result && typeof result.catch === "function") result.catch(() => {});
  }

  function clearFocusState(state) {
    state.wasPlayingBeforeBlur = false;
    state.pauseDetectedFromBlur = false;
    state.suppressBlurPause = false;
    state.focusGraceUntil = 0;
    state.manualPauseUntil = 0;
    state.lastKnownPlaying = !state.video.paused && !state.video.ended;
  }

  function cancelAsManualPause(state) {
    state.cycle += 1;
    clearFocusState(state);
    state.lastKnownPlaying = false;
  }

  function attach(video) {
    if (states.has(video)) return states.get(video);
    const initialTime = currentTime(video);
    const state = {
      video,
      lastTime: initialTime > 0 ? initialTime : 0,
      timeAtBlur: 0,
      sourceAtBlur: "",
      wasPlayingBeforeBlur: !video.paused && !video.ended,
      lastKnownPlaying: !video.paused && !video.ended,
      pauseDetectedFromBlur: false,
      suppressBlurPause: false,
      focusGraceUntil: 0,
      manualPauseUntil: 0,
      cycle: 0,
    };
    states.set(video, state);

    video.addEventListener("timeupdate", () => {
      const now = currentTime(video);
      if (Number.isFinite(now) && now >= 0 &&
          !(state.suppressBlurPause && state.wasPlayingBeforeBlur && state.lastTime > 3 && now < 2)) {
        state.lastTime = now;
      }
      if (!video.paused && !video.ended) state.lastKnownPlaying = true;
    }, true);
    video.addEventListener("loadedmetadata", () => {
      if (!pageBlurred && !video.paused && !video.ended) {
        state.lastTime = currentTime(video);
        state.lastKnownPlaying = true;
      }
    }, true);
    video.addEventListener("seeked", () => {
      const now = currentTime(video);
      if (Number.isFinite(now) && now >= 0) state.lastTime = now;
    }, true);
    video.addEventListener("playing", () => {
      state.lastTime = currentTime(video);
      state.lastKnownPlaying = true;
      state.pauseDetectedFromBlur = false;
    }, true);
    video.addEventListener("pause", () => {
      const now = Date.now();
      if (state.manualPauseUntil >= now) {
        cancelAsManualPause(state);
        return;
      }
      const blurRelated = state.wasPlayingBeforeBlur &&
        (state.suppressBlurPause || now < state.focusGraceUntil);
      if (blurRelated && !video.ended) {
        state.pauseDetectedFromBlur = true;
        state.lastKnownPlaying = false;
      } else {
        state.lastKnownPlaying = false;
        if (!pageBlurred && now >= state.focusGraceUntil) {
          state.wasPlayingBeforeBlur = false;
          state.suppressBlurPause = false;
        }
      }
    }, true);
    video.addEventListener("ended", () => {
      clearFocusState(state);
      state.lastKnownPlaying = false;
    }, true);
    return state;
  }

  function scan() {
    for (const video of document.querySelectorAll("video")) {
      if (video instanceof HTMLVideoElement) attach(video);
    }
  }

  function rootFor(video) {
    try { return video.closest(PLAYER_ROOTS) || video.parentElement; }
    catch { return video.parentElement; }
  }

  function markManualPause(event) {
    const target = event.target instanceof Element ? event.target : null;
    const isClick = event.type === "pointerdown" && Boolean(target);
    const toggle = isClick && Boolean(target.closest(PLAY_PAUSE_CONTROLS));
    const shortcut = event.type === "keydown" &&
      (event.code === "Space" || String(event.key || "").toLowerCase() === "k") &&
      !(target && target.matches("input, textarea, select, [contenteditable='true']"));
    if (!toggle && !isClick && !shortcut) return;

    for (const state of states.values()) {
      const video = state.video;
      if (video.paused || video.ended) continue;
      const root = rootFor(video);
      if (!root || !target || !root.contains(target)) continue;
      const onSurface = isClick &&
        (target === video || Boolean(target.closest(PLAYER_SURFACES)));
      const onToggle = toggle && Boolean(target.closest(PLAY_PAUSE_CONTROLS));
      const onShortcut = shortcut && root.contains(target);
      if (onSurface || onToggle || onShortcut) state.manualPauseUntil = Date.now() + 1600;
    }
  }

  function noteBlur() {
    const now = Date.now();
    if (pageBlurred || (lastBlurAt > 0 && now - lastBlurAt < 150)) return;
    pageBlurred = true;
    lastBlurAt = now;
    scan();
    for (const state of states.values()) {
      const video = state.video;
      state.wasPlayingBeforeBlur = (!video.paused && !video.ended) || state.lastKnownPlaying;
      state.pauseDetectedFromBlur = false;
      state.suppressBlurPause = state.wasPlayingBeforeBlur;
      state.focusGraceUntil = 0;
      state.manualPauseUntil = 0;
      state.cycle += 1;
      const nowTime = currentTime(video);
      state.timeAtBlur = Number.isFinite(nowTime) ? nowTime : state.lastTime;
      state.sourceAtBlur = sourceOf(video);
      if (state.timeAtBlur > 0) state.lastTime = state.timeAtBlur;
    }
  }

  function restoreIfReset(state) {
    const video = state.video;
    if (sourceOf(video) !== state.sourceAtBlur) return;
    const target = state.lastTime > 0 ? state.lastTime : state.timeAtBlur;
    const now = currentTime(video);
    if (!Number.isFinite(target) || target < 3 || !Number.isFinite(now) || now >= target - 3) return;
    if (Number.isFinite(video.duration) && target < video.duration - 0.5) seekTo(video, target);
  }

  function recover(state, cycle) {
    if (cycle !== state.cycle || document.hidden ||
        (typeof document.hasFocus === "function" && !document.hasFocus())) return;
    const video = state.video;
    if (!state.wasPlayingBeforeBlur || video.ended || !video.isConnected ||
        state.manualPauseUntil >= Date.now()) return;
    if (sourceOf(video) !== state.sourceAtBlur) {
      clearFocusState(state);
      return;
    }
    restoreIfReset(state);
    if (video.paused) {
      state.pauseDetectedFromBlur = true;
      play(video);
    }
  }

  function finishRecovery(state, cycle) {
    if (cycle !== state.cycle) return;
    if (!state.video.paused && !state.video.ended) {
      state.lastTime = currentTime(state.video);
      state.lastKnownPlaying = true;
    }
    clearFocusState(state);
  }

  function scheduleRecovery(state) {
    const cycle = state.cycle;
    for (const delay of RETRY_DELAYS) {
      window.setTimeout(() => recover(state, cycle), delay);
    }
    window.setTimeout(() => finishRecovery(state, cycle), GRACE_MS + 150);
  }

  function noteFocus() {
    if (document.hidden ||
        (typeof document.hasFocus === "function" && !document.hasFocus()) ||
        !pageBlurred) return;
    pageBlurred = false;
    const now = Date.now();
    for (const state of states.values()) {
      if (!state.wasPlayingBeforeBlur) continue;
      state.suppressBlurPause = true;
      state.focusGraceUntil = now + GRACE_MS;
      scheduleRecovery(state);
    }
  }

  function shouldSuppressPause(media, now) {
    const state = states.get(media);
    if (!state || state.manualPauseUntil >= now || media.ended) return false;
    if (!state.wasPlayingBeforeBlur || !state.suppressBlurPause) return false;
    return pageBlurred || document.hidden ||
      (typeof document.hasFocus === "function" && !document.hasFocus()) ||
      now < state.focusGraceUntil;
  }

  try {
    Object.defineProperty(prototype, "pause", {
      ...descriptor,
      value: function (...args) {
        if (shouldSuppressPause(this, Date.now())) return undefined;
        return Reflect.apply(nativePause, this, args);
      },
    });
    Object.defineProperty(prototype, marker, {
      value: true, configurable: false, enumerable: false, writable: false,
    });
  } catch {
    return false;
  }

  window.addEventListener("pointerdown", markManualPause, true);
  window.addEventListener("keydown", markManualPause, true);
  window.addEventListener("blur", noteBlur, true);
  window.addEventListener("focus", noteFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) noteBlur();
    else noteFocus();
  }, true);
  scan();
  observer = new MutationObserver(scan);
  observer.observe(document, { childList: true, subtree: true });
  return true;
}

let installed = false;
try {
  if (typeof contextBridge.executeInMainWorld === "function") {
    installed = contextBridge.executeInMainWorld({ func: installExternalPlayerFocusGuard }) === true;
  }
} catch {
  // Fall back to Electron's stable page-execution API below.
}

if (!installed) {
  try {
    void webFrame.executeJavaScript("(" + installExternalPlayerFocusGuard.toString() + ")()")
      .catch(() => {
        // Source playback must continue if the best-effort guard cannot be installed.
      });
  } catch {
    // Do not interrupt source loading if page execution is unavailable.
  }
}

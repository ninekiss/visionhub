const { contextBridge, ipcRenderer, webFrame } = require("electron");

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


/*
 * Progress/session bridge runs only in the isolated preload world. The source
 * page cannot access ipcRenderer; every progress payload is also verified in
 * the main process against the active WebContentsView and request ID.
 */
let externalPlayerRequestId = "";
let initialResumeTime = 0;
let restoreTarget = 0;
let restoreStartedAt = 0;
let restoreLastSetAt = 0;
let restoreMatchedSince = 0;
let restoreAttempts = 0;
let restoreComplete = false;
let restoreFailed = false;
let restoreUserInterrupted = false;
let restoreTimer = null;
let lastProgressReportAt = 0;
let sessionInitialized = false;
const trackedVideos = new WeakSet();

const RESTORE_MAX_DURATION_MS = 15000;
const RESTORE_RETRY_INTERVAL_MS = 400;
const RESTORE_MAX_ATTEMPTS = 24;
const RESTORE_CONFIRMATION_MS = 1800;
const SEEK_CONTROL_SELECTOR = [
  ".plyr__progress", "[data-plyr='seek']", ".vjs-progress-control",
  ".jw-slider-time", ".dplayer-bar-wrap", ".dplayer-bar",
  ".art-progress", ".xgplayer-progress", ".bpx-player-progress", ".prism-progress",
  "[role='slider'][aria-label*='seek' i]", "[role='slider'][aria-label*='progress' i]",
  "[role='slider'][aria-label*='time' i]"
].join(", ");

function visibleVideo(video) {
  if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
  const style = getComputedStyle(video);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
  const rect = video.getBoundingClientRect();
  return rect.width >= 100 && rect.height >= 56 &&
    rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
}

function primaryVideo() {
  return Array.from(document.querySelectorAll("video"))
    .filter(visibleVideo)
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      const area = b.width * b.height - a.width * a.height;
      if (area !== 0) return area;
      return Number(right.readyState >= HTMLMediaElement.HAVE_METADATA) -
        Number(left.readyState >= HTMLMediaElement.HAVE_METADATA);
    })[0] ?? null;
}

function clearRestoreTimer() {
  if (restoreTimer !== null) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }
}

function finishRestore(video, failed = false) {
  restoreComplete = true;
  restoreFailed = failed;
  clearRestoreTimer();
  if (!failed && video && primaryVideo() === video) reportProgress(video, true);
}

function scheduleRestoreRetry() {
  if (restoreTimer !== null || restoreComplete || restoreUserInterrupted) return;
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    tryRestore(primaryVideo());
  }, RESTORE_RETRY_INTERVAL_MS);
}

function tryRestore(video) {
  if (!sessionInitialized || restoreComplete || restoreUserInterrupted) return;
  const now = Date.now();
  if (restoreTarget <= 0) {
    finishRestore(video, false);
    return;
  }
  if (now - restoreStartedAt >= RESTORE_MAX_DURATION_MS ||
      restoreAttempts >= RESTORE_MAX_ATTEMPTS) {
    finishRestore(video, true);
    return;
  }
  if (!video || primaryVideo() !== video ||
      video.readyState < HTMLMediaElement.HAVE_METADATA ||
      !Number.isFinite(video.duration) || video.duration <= 0) {
    scheduleRestoreRetry();
    return;
  }

  const distance = Math.abs(video.currentTime - restoreTarget);
  if (!video.seeking && restoreAttempts === 0 && video.currentTime >= restoreTarget + 3) {
    // The source has already selected a later position. Never seek it backwards.
    finishRestore(video, false);
    return;
  }
  if (distance <= 3 && !video.seeking) {
    if (restoreMatchedSince === 0) restoreMatchedSince = now;
    if (now - restoreMatchedSince >= RESTORE_CONFIRMATION_MS) {
      finishRestore(video, false);
      return;
    }
  } else {
    restoreMatchedSince = 0;
    if (!video.seeking && now - restoreLastSetAt >= RESTORE_RETRY_INTERVAL_MS - 50) {
      try {
        video.currentTime = restoreTarget;
        restoreAttempts += 1;
        restoreLastSetAt = now;
      } catch {
        // Providers can reject seeking until their internal player is ready.
      }
    }
  }
  scheduleRestoreRetry();
}

function reportProgress(video, force = false) {
  if (!sessionInitialized || !externalPlayerRequestId || !video ||
      primaryVideo() !== video ||
      !Number.isFinite(video.currentTime) ||
      !Number.isFinite(video.duration) || video.duration <= 0) return;
  if (restoreTarget > 0 && !restoreComplete && !restoreUserInterrupted) return;
  if (restoreFailed && !restoreUserInterrupted && video.currentTime < restoreTarget - 3) return;
  const now = Date.now();
  if (!force && now - lastProgressReportAt < 2000) return;
  lastProgressReportAt = now;
  try {
    ipcRenderer.send("external-player:progress", {
      requestId: externalPlayerRequestId,
      currentTime: Math.max(0, Math.min(video.currentTime, video.duration)),
      duration: video.duration,
    });
  } catch {
    // Progress is a convenience feature and must never interrupt source playback.
  }
}

function interruptRestoreForManualSeek(event) {
  if (!sessionInitialized || restoreComplete || restoreTarget <= 0 || restoreUserInterrupted) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !target.closest(SEEK_CONTROL_SELECTOR)) return;
  restoreUserInterrupted = true;
  restoreComplete = true;
  restoreFailed = false;
  clearRestoreTimer();
  const video = primaryVideo();
  if (video) reportProgress(video, true);
}

function attachProgressVideo(video) {
  if (!(video instanceof HTMLVideoElement) || trackedVideos.has(video)) return;
  trackedVideos.add(video);
  const update = (force = false) => {
    if (!sessionInitialized) return;
    tryRestore(primaryVideo());
    reportProgress(video, force);
  };
  for (const eventName of ["loadedmetadata", "durationchange", "canplay", "playing", "timeupdate"]) {
    video.addEventListener(eventName, () => update(false));
  }
  for (const eventName of ["pause", "seeked", "ended"]) {
    video.addEventListener(eventName, () => update(true));
  }
}

function scanProgressVideos() {
  for (const video of document.querySelectorAll("video")) attachProgressVideo(video);
  if (sessionInitialized) tryRestore(primaryVideo());
}

function resetProgressSession(payload) {
  if (!payload || typeof payload.requestId !== "string" ||
      !/^[a-zA-Z0-9:._-]{1,160}$/.test(payload.requestId)) return;
  externalPlayerRequestId = payload.requestId;
  initialResumeTime = typeof payload.initialTime === "number" &&
    Number.isFinite(payload.initialTime) && payload.initialTime >= 0
    ? payload.initialTime
    : 0;
  restoreTarget = initialResumeTime >= 5 ? initialResumeTime : 0;
  restoreStartedAt = Date.now();
  restoreLastSetAt = 0;
  restoreMatchedSince = 0;
  restoreAttempts = 0;
  restoreComplete = restoreTarget <= 0;
  restoreFailed = false;
  restoreUserInterrupted = false;
  lastProgressReportAt = 0;
  sessionInitialized = true;
  clearRestoreTimer();
  scanProgressVideos();
  tryRestore(primaryVideo());
}

ipcRenderer.on("external-player:initialize", (_event, payload) => {
  resetProgressSession(payload);
});
document.addEventListener("pointerdown", interruptRestoreForManualSeek, true);
document.addEventListener("input", interruptRestoreForManualSeek, true);
document.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(PLAYER_ROOT_SELECTOR_FOR_KEYS)) return;
  interruptRestoreForManualSeek(event);
}, true);

const PLAYER_ROOT_SELECTOR_FOR_KEYS = [
  ".plyr", ".dplayer", ".video-js", ".jwplayer", ".artplayer-app",
  ".xgplayer", ".bpx-player-container", ".prism-player"
].join(", ");

const progressObserver = new MutationObserver(scanProgressVideos);
progressObserver.observe(document, { childList: true, subtree: true });
scanProgressVideos();

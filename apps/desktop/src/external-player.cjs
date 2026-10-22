function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveProviderUrl(provider, contentId) {
  if (!provider || typeof provider.id !== "string" || typeof provider.urlTemplate !== "string") {
    throw new TypeError("The selected playback provider is not configured.");
  }
  if (typeof contentId !== "string" || !contentId.trim() || contentId.length > 512) {
    throw new TypeError("A valid external content ID is required.");
  }
  if (!Array.isArray(provider.allowedOrigins) || provider.allowedOrigins.length === 0) {
    throw new TypeError("The selected provider has no allowed HTTPS origins.");
  }
  const replaced = provider.urlTemplate.replaceAll("{contentId}", encodeURIComponent(contentId.trim()));
  if (replaced.includes("{") || replaced.includes("}")) {
    throw new TypeError("The provider URL template contains unsupported template variables.");
  }
  let url;
  try {
    url = new URL(replaced);
  } catch {
    throw new TypeError("The configured provider URL template is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      !provider.allowedOrigins.includes(url.origin)) {
    throw new TypeError("The generated source URL is outside the provider's HTTPS allowlist.");
  }
  return url.href;
}

function isValidExternalPlayerRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9:._-]{1,160}$/.test(value);
}

function canShowExternalPlayer({ ready, visible, htmlFullscreen }) {
  return ready === true && (htmlFullscreen === true || visible === true);
}

function validateExternalPlayerBounds(value) {
  if (!isRecord(value)) throw new TypeError("Invalid external-player bounds.");
  for (const key of ["x", "y", "width", "height"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      throw new TypeError("External-player bounds must contain finite numbers.");
    }
  }
  const x = Math.round(value.x);
  const y = Math.round(value.y);
  const width = Math.round(value.width);
  const height = Math.round(value.height);
  // Negative origins are valid for a child view partially scrolled beyond
  // the renderer viewport. Electron clips the child view to its parent.
  if (x < -20000 || y < -20000 || x > 20000 || y > 20000 ||
      width < 1 || height < 1 || width > 20000 || height > 20000) {
    throw new TypeError("External-player bounds are outside the accepted range.");
  }
  if (value.visible !== undefined && typeof value.visible !== "boolean") {
    throw new TypeError("External-player visibility must be a boolean.");
  }
  return { x, y, width, height, visible: value.visible !== false };
}

/** Build a fixed script that only queries CSS selectors supplied by validated local configuration. */
function createPlayerIsolationScript(playerSelector, readinessSelector) {
  const player = JSON.stringify(playerSelector);
  const ready = JSON.stringify(readinessSelector || playerSelector);
  return `(() => {
    let target;
    let readinessTarget;
    try {
      readinessTarget = document.querySelector(${ready});
      if (!readinessTarget) return false;
      target = document.querySelector(${player});
    } catch {
      return false;
    }
    if (!target || target === document.documentElement || target === document.body) return false;

    const isVisibleWithBounds = (element) => {
      if (!(element instanceof Element) || !element.isConnected) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    // Do not start the display grace period for a selector that merely exists
    // in the DOM but is hidden, collapsed, or has not been laid out yet.
    if (!isVisibleWithBounds(target) || !isVisibleWithBounds(readinessTarget)) return false;

    // A matched <video> element is not necessarily displaying a frame yet.
    const video = readinessTarget instanceof HTMLVideoElement
      ? readinessTarget
      : readinessTarget.querySelector?.("video");
    if (video && (
      !isVisibleWithBounds(video) ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    )) return false;

    let branch = target;
    while (branch && branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch) sibling.style.setProperty("display", "none", "important");
      }
      if (parent === document.body) break;
      branch = parent;
    }

    const root = document.documentElement;
    const body = document.body;
    for (const element of [root, body]) {
      element.style.setProperty("width", "100%", "important");
      element.style.setProperty("height", "100%", "important");
      element.style.setProperty("min-width", "0", "important");
      element.style.setProperty("min-height", "0", "important");
      element.style.setProperty("margin", "0", "important");
      element.style.setProperty("padding", "0", "important");
      element.style.setProperty("overflow", "hidden", "important");
      element.style.setProperty("background", "#000", "important");
    }
    target.style.setProperty("position", "fixed", "important");
    target.style.setProperty("inset", "0", "important");
    target.style.setProperty("width", "100vw", "important");
    target.style.setProperty("height", "100vh", "important");
    target.style.setProperty("max-width", "none", "important");
    target.style.setProperty("max-height", "none", "important");
    target.style.setProperty("margin", "0", "important");
    target.style.setProperty("z-index", "2147483647", "important");
    return true;
  })()`;
}

/**
 * Build a fixed DOM-only bridge for an explicitly allowed child frame.
 * It has no Electron/Node capabilities; progress is relayed via postMessage
 * to the top-frame preload, which validates the frame origin and session token.
 */
function createSubframePlayerBridgeScript(options) {
  if (!isRecord(options)) throw new TypeError("Subframe bridge options are required.");
  const config = {
    requestId: typeof options.requestId === "string" ? options.requestId : "",
    token: typeof options.token === "string" ? options.token : "",
    initialTime: typeof options.initialTime === "number" && Number.isFinite(options.initialTime)
      ? options.initialTime
      : 0,
    restoreTimeoutMs: typeof options.restoreTimeoutMs === "number" && Number.isFinite(options.restoreTimeoutMs)
      ? Math.min(Math.max(options.restoreTimeoutMs, 30000), 120000)
      : 60000,
    playerSelector: typeof options.playerSelector === "string" && options.playerSelector.length <= 300
      ? options.playerSelector
      : "",
    readinessSelector: typeof options.readinessSelector === "string" && options.readinessSelector.length <= 300
      ? options.readinessSelector
      : "",
  };
  if (!isValidExternalPlayerRequestId(config.requestId) || !config.token || config.token.length > 200) {
    throw new TypeError("Subframe bridge session identifiers are invalid.");
  }
  return "(" + runSubframePlayerBridge.toString() + ")(" + JSON.stringify(config) + ")";
}

function runSubframePlayerBridge(config) {
  "use strict";
  if (window === window.top) return false;

  const marker = "__visionHubDesktopSourceFrameBridge";
  try {
    if (window[marker] === config.token) return true;
    Object.defineProperty(window, marker, {
      value: config.token, configurable: false, enumerable: false, writable: false
    });
  } catch {
    return false;
  }

  const CHANNEL = "visionhub-desktop-source-frame-v1";
  const SEEK_RETRY_MS = 400;
  const CONFIRM_MS = 1000;
  const MAX_ATTEMPTS = Math.ceil(config.restoreTimeoutMs / SEEK_RETRY_MS) + 6;
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
    "button[title^='play' i]", "button[title*='pause' i]"
  ].join(", ");

  const states = new Map();
  const trackedVideos = new WeakSet();
  const restoreTarget = config.initialTime >= 5 ? config.initialTime : 0;
  const restoreStartedAt = Date.now();
  let restoreAttempts = 0;
  let restoreLastSetAt = 0;
  let restoreMatchedSince = 0;
  let restoreSeekConfirmed = false;
  let restoreComplete = restoreTarget <= 0;
  let restoreFailed = false;
  let restoreUserInterrupted = false;
  let restoreTimer = null;
  let lastProgressReportAt = 0;
  let pageBlurred = false;
  let lastBlurAt = 0;

  function sourcePlayer(video) {
    try {
      if (video.plyr && typeof video.plyr === "object") return video.plyr;
      const root = video.closest(".plyr");
      if (root && root.plyr && typeof root.plyr === "object") return root.plyr;
    } catch {}
    return null;
  }

  function readTime(video) {
    const player = sourcePlayer(video);
    try {
      if (player && Number.isFinite(Number(player.currentTime))) return Number(player.currentTime);
    } catch {}
    return Number.isFinite(video.currentTime) ? video.currentTime : 0;
  }

  function isVisible(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    const style = window.getComputedStyle(video);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= 100 && rect.height >= 56;
  }

  function videosWithin(selector) {
    if (typeof selector !== "string" || !selector.trim()) return [];
    try {
      const node = document.querySelector(selector);
      if (!node) return [];
      if (node instanceof HTMLVideoElement) return [node];
      return typeof node.querySelectorAll === "function" ? Array.from(node.querySelectorAll("video")) : [];
    } catch {
      return [];
    }
  }

  function primaryVideo() {
    const preferred = [
      ...videosWithin(config.readinessSelector),
      ...videosWithin(config.playerSelector),
    ].filter((video, index, all) => video instanceof HTMLVideoElement &&
      video.isConnected && all.indexOf(video) === index);
    if (preferred.length) return preferred.find(isVisible) || preferred[0];
    const all = Array.from(document.querySelectorAll("video"))
      .filter((video) => video instanceof HTMLVideoElement && video.isConnected)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    return all.find(isVisible) || all[0] || null;
  }

  function postProgress(video, force) {
    if (!video || primaryVideo() !== video || !Number.isFinite(video.duration) ||
        video.duration <= 0 || !Number.isFinite(video.currentTime)) return;
    if (restoreTarget > 0 && !restoreComplete && !restoreUserInterrupted) return;
    if (restoreFailed && !restoreUserInterrupted && video.currentTime < restoreTarget - 3) return;
    const now = Date.now();
    if (!force && now - lastProgressReportAt < 2000) return;
    lastProgressReportAt = now;
    try {
      window.top.postMessage({
        channel: CHANNEL,
        type: "progress",
        token: config.token,
        requestId: config.requestId,
        currentTime: Math.max(0, Math.min(video.currentTime, video.duration)),
        duration: video.duration,
        force: force === true
      }, "*");
    } catch {}
  }

  function finishRestore(video, failed) {
    restoreComplete = true;
    restoreFailed = failed === true;
    if (restoreTimer !== null) clearTimeout(restoreTimer);
    restoreTimer = null;
    if (!restoreFailed) postProgress(video, true);
  }

  function scheduleRestore() {
    if (restoreTimer !== null || restoreComplete || restoreUserInterrupted) return;
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      tryRestore(primaryVideo());
    }, SEEK_RETRY_MS);
  }

  function tryRestore(video) {
    if (restoreComplete || restoreUserInterrupted) return;
    const now = Date.now();
    if (now - restoreStartedAt >= config.restoreTimeoutMs || restoreAttempts >= MAX_ATTEMPTS) {
      finishRestore(video, true);
      return;
    }
    if (!video || primaryVideo() !== video ||
        video.readyState < HTMLMediaElement.HAVE_METADATA ||
        !Number.isFinite(video.duration) || video.duration <= 0) {
      scheduleRestore();
      return;
    }
    if (restoreTarget <= 0) {
      finishRestore(video, false);
      return;
    }
    if (restoreTarget >= video.duration - 2) {
      finishRestore(video, true);
      return;
    }

    const distance = Math.abs(video.currentTime - restoreTarget);
    if (!video.seeking && restoreAttempts === 0 && video.currentTime >= restoreTarget + 3) {
      finishRestore(video, false);
      return;
    }
    if (distance <= 3 && !video.seeking && restoreSeekConfirmed) {
      if (restoreMatchedSince === 0) restoreMatchedSince = now;
      if (now - restoreMatchedSince >= CONFIRM_MS) {
        finishRestore(video, false);
        return;
      }
    } else {
      restoreMatchedSince = 0;
      if (!video.seeking && now - restoreLastSetAt >= SEEK_RETRY_MS - 50) {
        try {
          const player = sourcePlayer(video);
          restoreSeekConfirmed = false;
          restoreLastSetAt = now;
          restoreAttempts += 1;
          if (player && Number.isFinite(Number(player.currentTime))) player.currentTime = restoreTarget;
          if (!player || !Number.isFinite(Number(player.currentTime)) ||
              Math.abs(Number(player.currentTime) - restoreTarget) > 3) {
            video.currentTime = restoreTarget;
          }
        } catch {
          try { video.currentTime = restoreTarget; } catch {}
        }
      }
    }
    scheduleRestore();
  }

  function cancelAsManualPause(state) {
    state.wasPlayingBeforeBlur = false;
    state.suppressBlurPause = false;
    state.focusGraceUntil = 0;
    state.manualPauseUntil = 0;
  }

  function attach(video) {
    if (!(video instanceof HTMLVideoElement) || trackedVideos.has(video)) return;
    trackedVideos.add(video);
    const state = {
      video,
      lastTime: readTime(video),
      timeAtBlur: 0,
      wasPlayingBeforeBlur: !video.paused && !video.ended,
      lastKnownPlaying: !video.paused && !video.ended,
      suppressBlurPause: false,
      focusGraceUntil: 0,
      manualPauseUntil: 0
    };
    states.set(video, state);
    const update = (force) => {
      if (!video.paused && !video.ended) state.lastKnownPlaying = true;
      tryRestore(primaryVideo());
      postProgress(video, force === true);
    };
    video.addEventListener("timeupdate", () => {
      const time = readTime(video);
      if (Number.isFinite(time) &&
          !(state.suppressBlurPause && state.wasPlayingBeforeBlur && state.lastTime > 3 && time < 2)) {
        state.lastTime = time;
      }
      update(false);
    }, true);
    video.addEventListener("loadedmetadata", () => update(false), true);
    video.addEventListener("durationchange", () => update(false), true);
    video.addEventListener("canplay", () => update(false), true);
    video.addEventListener("playing", () => {
      state.lastTime = readTime(video);
      state.lastKnownPlaying = true;
      update(false);
    }, true);
    video.addEventListener("seeked", () => {
      if (video === primaryVideo() && restoreTarget > 0 && !restoreComplete &&
          !restoreUserInterrupted && restoreLastSetAt > 0 &&
          Date.now() - restoreLastSetAt < 10000 &&
          Math.abs(video.currentTime - restoreTarget) <= 3) {
        restoreSeekConfirmed = true;
        if (restoreMatchedSince === 0) restoreMatchedSince = Date.now();
      }
      update(true);
    }, true);
    for (const eventName of ["pause", "ended"]) {
      video.addEventListener(eventName, () => update(true), true);
    }
  }

  function scan() {
    for (const video of document.querySelectorAll("video")) attach(video);
    tryRestore(primaryVideo());
  }

  function noteBlur() {
    if (pageBlurred) return;
    pageBlurred = true;
    lastBlurAt = Date.now();
    scan();
    for (const state of states.values()) {
      const video = state.video;
      state.wasPlayingBeforeBlur = (!video.paused && !video.ended) || state.lastKnownPlaying;
      state.suppressBlurPause = state.wasPlayingBeforeBlur;
      state.focusGraceUntil = 0;
      state.manualPauseUntil = 0;
      state.timeAtBlur = readTime(video);
      if (state.timeAtBlur > 0) state.lastTime = state.timeAtBlur;
    }
  }

  function recoverFocus(state, cycleTime) {
    if (!state.wasPlayingBeforeBlur || Date.now() - cycleTime > 45000 ||
        document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus())) return;
    const video = state.video;
    if (!video.isConnected || video.ended || state.manualPauseUntil >= Date.now()) return;
    const target = state.lastTime > 0 ? state.lastTime : state.timeAtBlur;
    if (Number.isFinite(target) && target >= 0 && Number.isFinite(video.duration) &&
        target < video.duration - 0.5 && Math.abs(readTime(video) - target) > 3) {
      try {
        const player = sourcePlayer(video);
        if (player && Number.isFinite(Number(player.currentTime))) player.currentTime = target;
        else video.currentTime = target;
      } catch {
        try { video.currentTime = target; } catch {}
      }
    }
    if (video.paused) {
      try {
        const player = sourcePlayer(video);
        const result = player && typeof player.play === "function" ? player.play() : video.play();
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {}
    }
  }

  function noteFocus() {
    if (document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus()) || !pageBlurred) return;
    pageBlurred = false;
    const cycleTime = Date.now();
    for (const state of states.values()) {
      if (!state.wasPlayingBeforeBlur) continue;
      state.focusGraceUntil = cycleTime + 2400;
      for (const delay of [0, 100, 300, 700, 1300, 2200]) {
        setTimeout(() => recoverFocus(state, cycleTime), delay);
      }
      setTimeout(() => {
        if (cycleTime === lastBlurAt || !state.video.paused) {
          state.wasPlayingBeforeBlur = false;
          state.suppressBlurPause = false;
        }
      }, 2550);
    }
  }

  function markManualPause(event) {
    if (event.type !== "pointerdown" || !(event.target instanceof Element)) return;
    const target = event.target;
    for (const state of states.values()) {
      const video = state.video;
      if (video.paused || video.ended) continue;
      const root = video.closest(PLAYER_ROOTS) || video.parentElement;
      if (!root || !root.contains(target)) continue;
      if (target === video || target.closest(PLAY_PAUSE_CONTROLS) || target.closest(PLAYER_SURFACES)) {
        state.manualPauseUntil = Date.now() + 1500;
      }
    }
  }

  const pauseDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "pause");
  const nativePause = pauseDescriptor && pauseDescriptor.value;
  if (typeof nativePause === "function" && pauseDescriptor.configurable) {
    try {
      Object.defineProperty(HTMLMediaElement.prototype, "pause", {
        ...pauseDescriptor,
        value: function (...args) {
          const state = states.get(this);
          const now = Date.now();
          const suppress = state && state.suppressBlurPause && state.wasPlayingBeforeBlur &&
            state.manualPauseUntil < now && !this.ended &&
            (pageBlurred || document.hidden ||
              (typeof document.hasFocus === "function" && !document.hasFocus()) ||
              now < state.focusGraceUntil);
          if (suppress) return undefined;
          return Reflect.apply(nativePause, this, args);
        }
      });
    } catch {}
  }

  window.addEventListener("pointerdown", markManualPause, true);
  window.addEventListener("blur", noteBlur, true);
  window.addEventListener("focus", noteFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) noteBlur();
    else noteFocus();
  }, true);

  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document, { childList: true, subtree: true });
  return true;
}

function providerOriginAllowed(urlValue, provider) {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      Array.isArray(provider?.allowedOrigins) &&
      provider.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

module.exports = {
  canShowExternalPlayer,
  createPlayerIsolationScript,
  createSubframePlayerBridgeScript,
  isValidExternalPlayerRequestId,
  providerOriginAllowed,
  resolveProviderUrl,
  validateExternalPlayerBounds,
};

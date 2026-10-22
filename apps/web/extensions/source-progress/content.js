(() => {
  "use strict";

  const CHANNEL = "visionhub-source-progress-v1";
  const TRUSTED_KEY = "visionHubTrustedAppOrigins";
  const ENABLED_KEY = "visionHubEnabledSourceOrigins";
  const DISCOVERED_MESSAGE = "VH_SOURCE_PROGRESS_DISCOVERED_FRAMES";
  const CONTROL_AUTO_HIDE_DELAY_MS = 1800;
  const CONTROL_BAR_SELECTOR = [
    ".plyr__controls",
    ".dplayer-controller",
    ".jw-controlbar",
    ".jw-controls",
    ".art-controls",
    ".xgplayer-controls",
    ".xgplayer-controls-inner",
    ".vjs-control-bar",
    ".bpx-player-control-wrap",
    ".prism-controlbar",
    "[class*='control-bar']",
    "[class*='ControlBar']",
    "[class*='controlBar']",
    "[class*='controller']",
  ].join(", ");
  const SEEK_ACTION_SELECTOR = [
    "button", "[role='button']", "a", "[tabindex]", "[onclick]", "[data-plyr]",
    ".dplayer-icon-back", ".dplayer-icon-forward", ".jw-icon-rewind", ".jw-icon-forward",
    "[class*='fast-forward']", "[class*='fastForward']", "[class*='rewind']",
    "[class*='Rewind']", "[class*='backward']", "[class*='Backward']",
  ].join(", ");
  const SEEK_ACTION_PATTERN = /快进|快退|向前跳|向后跳|forward.{0,8}(?:\\d+\\s*(?:s|sec|seconds|秒)|jump|seek)|(?:\\d+\\s*(?:s|sec|secs|second|seconds|秒).{0,12})(?:rewind|backward|快退)|rewind|fast[\\s_-]*forward|seek[\\s_-]*(?:forward|backward|ahead|back)|skip[\\s_-]*(?:forward|backward|ahead)|dplayer[-_]icon[-_]back|jw-icon-rewind|jw-icon-forward|data-plyr.{0,12}(?:rewind|fastforward)/i;

  if (window.top === window || window.location.protocol !== "https:") return;

  let trustedAppOrigins = [];
  let enabledSourceOrigins = [];
  let session = null;
  let mutationObserver = null;
  const attachedVideos = new WeakSet();
  const relayedFrames = new WeakMap();
  const observedFrames = new WeakSet();
  let restoreTarget = 0;
  let restoreStartedAt = 0;
  let restoreLastSetAt = 0;
  let restoreMatchedSince = 0;
  let restoreAttempts = 0;
  let restoreComplete = false;
  let restoreFailed = false;
  let restoreUserInterrupted = false;
  let restoreTimer = null;
  let playerReadyReported = false;

  const RESTORE_MAX_DURATION_MS = 15000;
  const RESTORE_RETRY_INTERVAL_MS = 400;
  const RESTORE_MAX_ATTEMPTS = 24;
  const RESTORE_CONFIRMATION_MS = 2500;
  const SEEK_BAR_SELECTOR = [
    ".plyr__progress", "[data-plyr='seek']",
    ".vjs-progress-control", ".jw-slider-time", ".dplayer-bar-wrap",
    ".dplayer-bar", ".art-progress", ".xgplayer-progress",
    ".bpx-player-progress", ".prism-progress",
    "[role='slider'][aria-label*='seek' i]",
    "[role='slider'][aria-label*='progress' i]",
    "[role='slider'][aria-label*='time' i]"
  ].join(", ");

  function validAppOrigin(value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return url.origin;
      if (
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ) return url.origin;
      return null;
    } catch {
      return null;
    }
  }

  function isVisibleVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    const style = getComputedStyle(video);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= 100 && rect.height >= 56 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth;
  }

  function primaryVideo() {
    return Array.from(document.querySelectorAll("video"))
      .filter(isVisibleVideo)
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        const area = b.width * b.height - a.width * a.height;
        if (area !== 0) return area;
        return Number(right.readyState >= HTMLMediaElement.HAVE_METADATA) -
          Number(left.readyState >= HTMLMediaElement.HAVE_METADATA);
      })[0] ?? null;
  }


  // Track only attributes added by this extension so source DOM can be restored
  // when the selected player container is replaced.
  const PLAYER_ONLY_ACTIVE = "data-vh-sp-active";
  const PLAYER_ONLY_HIDDEN = "data-vh-sp-hidden";
  const PLAYER_ONLY_PATH = "data-vh-sp-path";
  const PLAYER_ONLY_ROOT = "data-vh-sp-root";
  const PLAYER_CONTROLS_IDLE = "data-vh-sp-controls-idle";
  const SUPPRESSED_SEEK_CONTROL = "data-vh-sp-suppressed";
  const controlHideTimers = new WeakMap();
  const controlBehaviorAttached = new WeakSet();
  const controlRootsBound = new WeakSet();
  const playerOnlyHiddenNodes = new Set();
  const playerOnlyPathNodes = new Set();
  let isolatedPlayerRoot = null;
  let addedRootMarker = false;

  function clearPlayerOnlyMode() {
    for (const element of playerOnlyHiddenNodes) element.removeAttribute(PLAYER_ONLY_HIDDEN);
    for (const element of playerOnlyPathNodes) element.removeAttribute(PLAYER_ONLY_PATH);
    playerOnlyHiddenNodes.clear();
    playerOnlyPathNodes.clear();
    if (isolatedPlayerRoot && addedRootMarker) {
      isolatedPlayerRoot.removeAttribute(PLAYER_ONLY_ROOT);
    }
    document.documentElement?.removeAttribute(PLAYER_ONLY_ACTIVE);
    isolatedPlayerRoot = null;
    addedRootMarker = false;
  }

  function playerRootFor(video) {
    const videoRect = video.getBoundingClientRect();
    const videoArea = Math.max(1, videoRect.width * videoRect.height);
    let best = video.parentElement;
    let bestScore = Number.NEGATIVE_INFINITY;
    let current = video.parentElement;
    let depth = 0;

    // Prefer recognizable player wrappers that also contain the native player's
    // own controls. Avoid selecting a whole article/page container.
    while (current && current !== document.body && current !== document.documentElement && depth < 9) {
      const rect = current.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width >= 100 && rect.height >= 56 && area >= videoArea * 0.8) {
        const className = typeof current.className === "string"
          ? current.className
          : current.getAttribute("class") || "";
        const identity = `${current.id} ${className} ${current.getAttribute("data-testid") || ""}`;
        const isPlayerNamed = /(player|plyr|dplayer|jwplayer|artplayer|xgplayer|video-js|vjs|prism|bpx-player|media-player)/i.test(identity);
        const isVideoNamed = /(video|media)/i.test(identity);
        const controls = Math.min(8, current.querySelectorAll(
          "button, [role='button'], [role='slider'], [class*='control'], [class*='Control'], [class*='progress']"
        ).length);
        const areaRatio = area / videoArea;
        let score = -depth * 3 + controls * 3;
        if (isPlayerNamed) score += 45;
        else if (isVideoNamed) score += 22;
        if (areaRatio <= 1.5) score += 12;
        else if (areaRatio <= 3) score += 8;
        else if (areaRatio <= 6) score += 2;
        else if (areaRatio > 20) score += isPlayerNamed ? -5 : -25;
        if (score > bestScore) {
          bestScore = score;
          best = current;
        }
      }
      current = current.parentElement;
      depth += 1;
    }
    return best instanceof HTMLElement ? best : video.parentElement;
  }

  function controlBarsIn(root) {
    if (!(root instanceof HTMLElement)) return [];
    const bars = [];
    if (root.matches(CONTROL_BAR_SELECTOR)) bars.push(root);
    bars.push(...root.querySelectorAll(CONTROL_BAR_SELECTOR));
    return [...new Set(bars)];
  }

  function setControlBarsIdle(root, idle) {
    for (const bar of controlBarsIn(root)) {
      if (idle) bar.setAttribute(PLAYER_CONTROLS_IDLE, "true");
      else bar.removeAttribute(PLAYER_CONTROLS_IDLE);
    }
  }

  function clearControlHideTimer(video) {
    const timer = controlHideTimers.get(video);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      controlHideTimers.delete(video);
    }
  }

  function hasOpenPlayerMenu(root) {
    if (!(root instanceof HTMLElement)) return false;
    const menus = root.querySelectorAll(
      ".plyr__menu__container, .plyr__menu, [role='menu'], [role='dialog'], [aria-modal='true']"
    );
    return Array.from(menus).some((menu) => {
      if (!(menu instanceof HTMLElement) || menu.hidden || menu.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = getComputedStyle(menu);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
      }
      const rect = menu.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function scheduleControlBarsHide(video, root, delay = CONTROL_AUTO_HIDE_DELAY_MS, waitingForMenuClose = false) {
    clearControlHideTimer(video);
    if (!(root instanceof HTMLElement) || video.paused || video.ended) {
      setControlBarsIdle(root, false);
      return;
    }

    const timer = window.setTimeout(() => {
      controlHideTimers.delete(video);
      if (!video.isConnected || video.paused || video.ended) return;
      if (hasOpenPlayerMenu(root)) {
        // Settings, quality, captions and speed menus live inside the control bar.
        // Keep their parent visible for as long as the menu is open.
        setControlBarsIdle(root, false);
        scheduleControlBarsHide(video, root, 300, true);
        return;
      }
      if (waitingForMenuClose) {
        // Start a fresh idle period after a menu closes, even when the menu
        // closed without a pointer or keyboard event reaching the player root.
        scheduleControlBarsHide(video, root);
        return;
      }
      setControlBarsIdle(root, true);
    }, delay);
    controlHideTimers.set(video, timer);
  }

  function seekControlDescription(element) {
    const nestedLabels = Array.from(element.querySelectorAll("svg title, img[alt], [data-plyr], [data-action]"))
      .slice(0, 4)
      .map((node) => [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.getAttribute("data-action"),
        node.getAttribute("data-plyr"),
        node.getAttribute("alt"),
        node.textContent,
      ].filter(Boolean).join(" "));
    const ownText = element.children.length <= 1 && (element.textContent || "").trim().length <= 48
      ? (element.textContent || "").trim()
      : "";
    return [
      element.id,
      typeof element.className === "string" ? element.className : element.getAttribute("class"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-action"),
      element.getAttribute("data-plyr"),
      element.getAttribute("data-title"),
      element.getAttribute("data-tooltip"),
      ownText,
      ...nestedLabels,
    ].filter(Boolean).join(" ");
  }

  function removeSeekShortcutButtons(root) {
    if (!(root instanceof HTMLElement)) return;
    for (const candidate of root.querySelectorAll(SEEK_ACTION_SELECTOR)) {
      if (!(candidate instanceof HTMLElement) || candidate.hasAttribute(SUPPRESSED_SEEK_CONTROL)) continue;
      if (!SEEK_ACTION_PATTERN.test(seekControlDescription(candidate))) continue;

      const control = candidate.matches("button, [role='button'], a, [tabindex], [onclick], [data-plyr]")
        ? candidate
        : candidate.closest("button, [role='button'], a, [tabindex], [onclick], [data-plyr]");
      if (!(control instanceof HTMLElement)) continue;

      // Never hide a settings/menu container or anything that owns one.
      if (control.matches(".plyr__menu__container, .plyr__menu, [role='menu'], [role='dialog']") ||
          control.querySelector(".plyr__menu__container, .plyr__menu, [role='menu'], [role='dialog']")) {
        continue;
      }
      control.setAttribute(SUPPRESSED_SEEK_CONTROL, "true");
    }
  }

  function refreshSourcePlayerControls(video) {
    const root = playerRootFor(video);
    if (!(root instanceof HTMLElement)) return null;

    removeSeekShortcutButtons(root);

    if (!controlRootsBound.has(root)) {
      controlRootsBound.add(root);
      const reveal = () => {
        const activeVideo = primaryVideo() ?? video;
        setControlBarsIdle(root, false);
        if (!activeVideo.paused && !activeVideo.ended) scheduleControlBarsHide(activeVideo, root);
      };
      for (const eventName of ["pointermove", "mousemove", "pointerdown", "touchstart", "keydown", "focusin"]) {
        root.addEventListener(eventName, reveal, { passive: true });
      }
      if (!video.paused && !video.ended) scheduleControlBarsHide(video, root);
    }

    if (video.paused || video.ended) {
      clearControlHideTimer(video);
      setControlBarsIdle(root, false);
    }
    return root;
  }

  function attachSourceControlBehavior(video) {
    if (controlBehaviorAttached.has(video)) return;
    controlBehaviorAttached.add(video);

    video.addEventListener("playing", () => {
      const root = refreshSourcePlayerControls(video);
      if (root) {
        setControlBarsIdle(root, false);
        scheduleControlBarsHide(video, root);
      }
    });
    for (const eventName of ["pause", "ended", "waiting", "seeking"]) {
      video.addEventListener(eventName, () => {
        clearControlHideTimer(video);
        const root = refreshSourcePlayerControls(video);
        if (root) setControlBarsIdle(root, false);
      });
    }
    video.addEventListener("seeked", () => {
      const root = refreshSourcePlayerControls(video);
      if (root && !video.paused && !video.ended) scheduleControlBarsHide(video, root);
    });
  }

  function isolatePageToPlayer(element, force = false) {
    if (!(element instanceof HTMLElement) || !element.isConnected ||
        !document.body || !document.documentElement) return;
    if (!force && isolatedPlayerRoot === element &&
        document.documentElement.getAttribute(PLAYER_ONLY_ACTIVE) === "true") return;

    clearPlayerOnlyMode();

    const chain = [];
    let current = element;
    while (current) {
      chain.push(current);
      if (current === document.body) break;
      current = current.parentElement;
    }
    if (chain[chain.length - 1] !== document.body) return;

    document.documentElement.setAttribute(PLAYER_ONLY_ACTIVE, "true");
    isolatedPlayerRoot = element;
    if (!element.hasAttribute(PLAYER_ONLY_ROOT)) {
      element.setAttribute(PLAYER_ONLY_ROOT, "true");
      addedRootMarker = true;
    }
    for (const node of chain) {
      if (!node.hasAttribute(PLAYER_ONLY_PATH)) {
        node.setAttribute(PLAYER_ONLY_PATH, "true");
        playerOnlyPathNodes.add(node);
      }
    }

    // At every level, hide sibling subtrees which are not part of the path to
    // the selected player. The DOM is retained so source-page player scripts
    // and custom controls keep working; visually, only the player remains.
    for (let index = 0; index < chain.length - 1; index += 1) {
      const childOnPath = chain[index];
      const parent = chain[index + 1];
      for (const sibling of parent.children) {
        if (sibling === childOnPath) continue;
        if (parent === document.documentElement && sibling.tagName === "HEAD") continue;
        if (!sibling.hasAttribute(PLAYER_ONLY_HIDDEN)) {
          sibling.setAttribute(PLAYER_ONLY_HIDDEN, "true");
          playerOnlyHiddenNodes.add(sibling);
        }
      }
    }
  }

  function postToParent(payload) {
    if (!session || !session.parentOrigin || window.parent === window) return;
    window.parent.postMessage({
      channel: CHANNEL,
      token: session.token,
      topOrigin: session.topOrigin,
      ...payload,
    }, session.parentOrigin);
  }

  function reportProgress(video, force = false) {
    if (!session || primaryVideo() !== video || video.duration <= 0 ||
        !Number.isFinite(video.duration) || !Number.isFinite(video.currentTime)) return;
    // Keep a source startup reset from overwriting the previously saved position.
    if (restoreTarget > 0 && !restoreComplete && !restoreUserInterrupted) return;
    if (restoreFailed && !restoreUserInterrupted && video.currentTime < restoreTarget - 3) return;
    const now = Date.now();
    if (!force && now - (session.lastReportAt ?? 0) < 2000) return;
    session.lastReportAt = now;
    postToParent({
      type: "progress",
      currentTime: Math.max(0, Math.min(video.currentTime, video.duration)),
      duration: video.duration,
      paused: video.paused,
    });
  }

  function reportPlayerReady(video) {
    if (!session || primaryVideo() !== video ||
        video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const playerRoot = playerRootFor(video);
    if (playerRoot) isolatePageToPlayer(playerRoot);
    if (playerReadyReported) return;
    playerReadyReported = true;
    postToParent({ type: "ready" });
  }

  function clearRestoreTimer() {
    if (restoreTimer !== null) {
      window.clearTimeout(restoreTimer);
      restoreTimer = null;
    }
  }

  function resetRestoreState() {
    clearRestoreTimer();
    restoreTarget = 0;
    restoreStartedAt = 0;
    restoreLastSetAt = 0;
    restoreMatchedSince = 0;
    restoreAttempts = 0;
    restoreComplete = false;
    restoreFailed = false;
    restoreUserInterrupted = false;
  }

  function finishRestore(video, failed = false) {
    restoreComplete = true;
    restoreFailed = failed;
    clearRestoreTimer();
    if (!failed && session && video && primaryVideo() === video) reportProgress(video, true);
  }

  function scheduleRestoreRetry(video) {
    if (restoreTimer !== null || restoreComplete || restoreUserInterrupted) return;
    restoreTimer = window.setTimeout(() => {
      restoreTimer = null;
      if (!session || primaryVideo() !== video || restoreComplete || restoreUserInterrupted) return;
      tryRestore(video);
    }, RESTORE_RETRY_INTERVAL_MS);
  }

  function tryRestore(video) {
    if (!session || primaryVideo() !== video || restoreComplete || restoreUserInterrupted) return;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA ||
        !Number.isFinite(video.duration) || video.duration <= 0) return;

    if (restoreTarget <= 0) {
      const initialTime = Number(session.initialTime);
      if (!Number.isFinite(initialTime) || initialTime < 5 || initialTime >= video.duration - 2) {
        finishRestore(video, false);
        return;
      }
      restoreTarget = initialTime;
      restoreStartedAt = Date.now();
    }

    const now = Date.now();
    const distance = Math.abs(video.currentTime - restoreTarget);

    // Never jump a source player backwards if it already restored a later position.
    // Once our seek has advanced naturally beyond the requested time, regard it as stable.
    if (!video.seeking && restoreAttempts === 0 && video.currentTime >= restoreTarget + 3) {
      finishRestore(video, false);
      return;
    }
    if (!video.seeking && restoreAttempts > 0 && !video.paused &&
        video.currentTime > restoreTarget + 3) {
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
      if (now - restoreStartedAt >= RESTORE_MAX_DURATION_MS ||
          restoreAttempts >= RESTORE_MAX_ATTEMPTS) {
        finishRestore(video, true);
        return;
      }
      if (!video.seeking && now - restoreLastSetAt >= RESTORE_RETRY_INTERVAL_MS - 50) {
        try {
          video.currentTime = restoreTarget;
          restoreAttempts += 1;
          restoreLastSetAt = now;
        } catch {
          // Some providers temporarily reject seeks while their player initializes.
        }
      }
    }

    if (now - restoreStartedAt >= RESTORE_MAX_DURATION_MS) {
      finishRestore(video, Math.abs(video.currentTime - restoreTarget) > 3);
      return;
    }
    scheduleRestoreRetry(video);
  }

  function noteManualSeek(event) {
    if (!session || restoreComplete || restoreTarget <= 0 || restoreUserInterrupted) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(SEEK_BAR_SELECTOR)) return;
    restoreUserInterrupted = true;
    restoreComplete = true;
    restoreFailed = false;
    clearRestoreTimer();
  }

  document.addEventListener("pointerdown", noteManualSeek, true);
  document.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
    noteManualSeek(event);
  }, true);
  document.addEventListener("input", noteManualSeek, true);

  function enableMainWorldBridge() {
    if (!session) return;
    try {
      window.postMessage({ channel: CHANNEL, type: "bridge-enable" }, location.origin);
    } catch {
      // The optional main-world bridge may be unavailable on older browsers.
    }
  }

  function attachVideo(video) {
    if (attachedVideos.has(video)) return;
    attachedVideos.add(video);
    attachSourceControlBehavior(video);
    refreshSourcePlayerControls(video);

    const update = (force = false) => {
      refreshSourcePlayerControls(video);
      if (!session) return;
      reportPlayerReady(video);
      tryRestore(video);
      reportProgress(video, force);
    };
    for (const eventName of ["loadedmetadata", "durationchange", "canplay", "playing", "timeupdate"]) {
      video.addEventListener(eventName, () => update(false));
    }
    for (const eventName of ["pause", "seeked", "ended"]) {
      video.addEventListener(eventName, () => update(true));
    }
  }

  function sendDiscoveredFrames() {
    if (!session) return;
    const origins = [...new Set(Array.from(document.querySelectorAll("iframe[src]"))
      .map((frame) => {
        try {
          return new URL(frame.getAttribute("src"), document.baseURI).origin;
        } catch {
          return null;
        }
      })
      .filter((origin) => origin && origin !== "null" && origin.startsWith("https://")) )];
    if (!origins.length) return;
    try {
      chrome.runtime.sendMessage({
        type: DISCOVERED_MESSAGE,
        topOrigin: session.topOrigin,
        origins,
      }).catch(() => {});
    } catch {
      // The browser may be shutting down or the extension can be reloaded.
    }
  }

  function relayInitializationToChildren() {
    if (!session) return;
    const message = {
      channel: CHANNEL,
      type: "initialize",
      token: session.token,
      topOrigin: session.topOrigin,
      initialTime: session.initialTime,
      __vhRelay: true,
    };

    for (const frame of Array.from(document.querySelectorAll("iframe"))) {
      if (!observedFrames.has(frame)) {
        observedFrames.add(frame);
        frame.addEventListener("load", () => {
          relayedFrames.delete(frame);
          relayInitializationToChildren();
        });
      }
      if (relayedFrames.get(frame) === session.token || !frame.contentWindow) continue;
      let origin;
      try {
        origin = new URL(frame.getAttribute("src") || frame.src, document.baseURI).origin;
      } catch {
        continue;
      }
      if (!enabledSourceOrigins.includes(origin)) continue;
      try {
        frame.contentWindow.postMessage(message, origin);
        relayedFrames.set(frame, session.token);
      } catch {
        // A changing/removed iframe can fail between discovery and postMessage.
      }
    }
    sendDiscoveredFrames();
  }

  function childFrameFor(source) {
    return Array.from(document.querySelectorAll("iframe"))
      .find((frame) => frame.contentWindow === source) ?? null;
  }

  function forwardChildMessage(event, message) {
    if (!session || event.source === window.parent) return;
    if (message.token !== session.token || !enabledSourceOrigins.includes(event.origin)) return;
    const frame = childFrameFor(event.source);
    if (!frame) return;

    // If the actual player is in a nested frame, make that frame the only
    // visible element in this document and relay its ready signal upward.
    if (message.type === "ready") {
      isolatePageToPlayer(frame);
      postToParent({ type: "ready" });
      return;
    }

    // Prefer a native video in this frame; otherwise relay nested-frame progress.
    if (primaryVideo()) return;
    if (message.type === "progress") {
      if (typeof message.currentTime !== "number" || typeof message.duration !== "number") return;
      postToParent({
        type: "progress",
        currentTime: message.currentTime,
        duration: message.duration,
        paused: Boolean(message.paused),
      });
    } else if (message.type === "connected") {
      postToParent({ type: "connected" });
    } else if (message.type === "ready") {
      postToParent({ type: "ready" });
    }
  }

  function onWindowMessage(event) {
    const message = event.data;
    if (!message || typeof message !== "object" || message.channel !== CHANNEL || event.source === window) return;

    if (message.type === "initialize") {
      if (event.source !== window.parent) return;
      const topOrigin = validAppOrigin(message.topOrigin);
      const directFromApp = trustedAppOrigins.includes(event.origin) && topOrigin === event.origin &&
        message.__vhRelay !== true;
      const relayedFromSource = message.__vhRelay === true &&
        enabledSourceOrigins.includes(event.origin) &&
        topOrigin !== null && trustedAppOrigins.includes(topOrigin);
      if (!directFromApp && !relayedFromSource) return;
      if (typeof message.token !== "string" || message.token.length < 16 || message.token.length > 200) return;

      if (session?.token === message.token) {
        enableMainWorldBridge();
        postToParent({ type: "connected" });
        relayInitializationToChildren();
        return;
      }

      session = {
        token: message.token,
        topOrigin,
        parentOrigin: event.origin,
        initialTime: Number.isFinite(message.initialTime) ? message.initialTime : 0,
        lastReportAt: 0,
      };
      resetRestoreState();
      playerReadyReported = false;
      enableMainWorldBridge();
      postToParent({ type: "connected" });
      for (const video of Array.from(document.querySelectorAll("video"))) {
        attachVideo(video);
        reportPlayerReady(video);
        tryRestore(video);
        reportProgress(video, true);
      }
      relayInitializationToChildren();
      return;
    }

    if (message.type === "progress" || message.type === "connected" || message.type === "ready") {
      forwardChildMessage(event, message);
    }
  }

  window.addEventListener("message", onWindowMessage);

  chrome.storage.local.get([TRUSTED_KEY, ENABLED_KEY]).then((stored) => {
    trustedAppOrigins = Array.isArray(stored[TRUSTED_KEY]) ? stored[TRUSTED_KEY] : [];
    enabledSourceOrigins = Array.isArray(stored[ENABLED_KEY]) ? stored[ENABLED_KEY] : [];
    if (!enabledSourceOrigins.includes(location.origin)) return;

    for (const video of Array.from(document.querySelectorAll("video"))) attachVideo(video);

    const root = document.documentElement;
    if (root) {
      mutationObserver = new MutationObserver(() => {
        for (const video of Array.from(document.querySelectorAll("video"))) attachVideo(video);
        if (session) {
          const video = primaryVideo();
          if (video) {
            const playerRoot = playerRootFor(video);
            if (playerRoot) isolatePageToPlayer(playerRoot, true);
            refreshSourcePlayerControls(video);
            reportPlayerReady(video);
            tryRestore(video);
          } else if (isolatedPlayerRoot?.isConnected) {
            isolatePageToPlayer(isolatedPlayerRoot, true);
          }
          relayInitializationToChildren();
        }
      });
      mutationObserver.observe(root, { childList: true, subtree: true });
    }
  }).catch(() => {});
})();

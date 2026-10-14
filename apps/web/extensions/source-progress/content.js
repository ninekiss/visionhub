(() => {
  "use strict";

  const CHANNEL = "visionhub-source-progress-v1";
  const TRUSTED_KEY = "visionHubTrustedAppOrigins";
  const ENABLED_KEY = "visionHubEnabledSourceOrigins";
  const DISCOVERED_MESSAGE = "VH_SOURCE_PROGRESS_DISCOVERED_FRAMES";

  if (window.top === window || window.location.protocol !== "https:") return;

  let trustedAppOrigins = [];
  let enabledSourceOrigins = [];
  let session = null;
  let mutationObserver = null;
  const attachedVideos = new WeakSet();
  const relayedFrames = new WeakMap();
  const observedFrames = new WeakSet();
  let restoreAttempted = false;
  let playerReadyReported = false;

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
  const PLAYER_ONLY_STYLE_ID = "visionhub-source-progress-player-only-style";
  const PLAYER_ONLY_ACTIVE = "data-vh-sp-active";
  const PLAYER_ONLY_HIDDEN = "data-vh-sp-hidden";
  const PLAYER_ONLY_PATH = "data-vh-sp-path";
  const PLAYER_ONLY_ROOT = "data-vh-sp-root";
  const playerOnlyHiddenNodes = new Set();
  const playerOnlyPathNodes = new Set();
  let isolatedPlayerRoot = null;
  let addedRootMarker = false;

  function ensurePlayerOnlyStyles() {
    if (document.getElementById(PLAYER_ONLY_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PLAYER_ONLY_STYLE_ID;
    style.textContent = `
      html[${PLAYER_ONLY_ACTIVE}="true"],
      html[${PLAYER_ONLY_ACTIVE}="true"] body {
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #000 !important;
      }
      [${PLAYER_ONLY_HIDDEN}="true"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      [${PLAYER_ONLY_PATH}="true"]:not([${PLAYER_ONLY_ROOT}="true"]) {
        transform: none !important;
        filter: none !important;
        backdrop-filter: none !important;
        perspective: none !important;
        contain: none !important;
        content-visibility: visible !important;
      }
      [${PLAYER_ONLY_ROOT}="true"] {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: none !important;
        filter: none !important;
        perspective: none !important;
        contain: none !important;
        overflow: hidden !important;
        z-index: 2147483647 !important;
      }
      [${PLAYER_ONLY_ROOT}="true"] video {
        max-width: 100% !important;
        max-height: 100% !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

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
        else if (areaRatio > 20) score -= 25;
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

  function isolatePageToPlayer(element, force = false) {
    if (!(element instanceof HTMLElement) || !element.isConnected ||
        !document.body || !document.documentElement) return;
    if (!force && isolatedPlayerRoot === element &&
        document.documentElement.getAttribute(PLAYER_ONLY_ACTIVE) === "true") return;

    clearPlayerOnlyMode();
    ensurePlayerOnlyStyles();

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

  function tryRestore(video) {
    if (!session || restoreAttempted || primaryVideo() !== video) return;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA ||
        !Number.isFinite(video.duration) || video.duration <= 0) return;

    restoreAttempted = true;
    const initialTime = Number(session.initialTime);
    if (Number.isFinite(initialTime) && initialTime >= 5 && initialTime < video.duration - 2) {
      try {
        if (Math.abs(video.currentTime - initialTime) > 3) video.currentTime = initialTime;
      } catch {
        // The provider's player may not yet permit seeking; continue watching without breaking playback.
      }
    }
    window.setTimeout(() => {
      if (session && primaryVideo() === video) reportProgress(video, true);
    }, 400);
  }

  function attachVideo(video) {
    if (attachedVideos.has(video)) return;
    attachedVideos.add(video);

    const update = (force = false) => {
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
      restoreAttempted = false;
      playerReadyReported = false;
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

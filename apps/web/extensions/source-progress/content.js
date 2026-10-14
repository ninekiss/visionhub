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

  function validOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.origin : null;
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

    // Prefer a visible video in this frame; otherwise relay the nested frame's progress upward.
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
    }
  }

  function onWindowMessage(event) {
    const message = event.data;
    if (!message || typeof message !== "object" || message.channel !== CHANNEL || event.source === window) return;

    if (message.type === "initialize") {
      if (event.source !== window.parent) return;
      const topOrigin = validOrigin(message.topOrigin);
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
      postToParent({ type: "connected" });
      for (const video of Array.from(document.querySelectorAll("video"))) attachVideo(video);
      relayInitializationToChildren();
      return;
    }

    if (message.type === "progress" || message.type === "connected") {
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
        if (session) relayInitializationToChildren();
      });
      mutationObserver.observe(root, { childList: true, subtree: true });
    }
  }).catch(() => {});
})();

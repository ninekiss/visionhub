const PLAYER_ONLY_CSS = "html[data-vh-sp-active=\"true\"],\nhtml[data-vh-sp-active=\"true\"] body {\n  width: 100% !important;\n  height: 100% !important;\n  min-width: 0 !important;\n  min-height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  overflow: hidden !important;\n  background: #000 !important;\n}\n\n[data-vh-sp-hidden=\"true\"] {\n  display: none !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}\n\n[data-vh-sp-path=\"true\"]:not([data-vh-sp-root=\"true\"]) {\n  transform: none !important;\n  filter: none !important;\n  backdrop-filter: none !important;\n  perspective: none !important;\n  contain: none !important;\n  content-visibility: visible !important;\n  overflow: visible !important;\n  will-change: auto !important;\n  clip-path: none !important;\n  mask: none !important;\n}\n\n[data-vh-sp-root=\"true\"] {\n  position: fixed !important;\n  inset: 0 !important;\n  width: 100vw !important;\n  height: 100vh !important;\n  min-width: 0 !important;\n  min-height: 0 !important;\n  max-width: none !important;\n  max-height: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  transform: none !important;\n  filter: none !important;\n  perspective: none !important;\n  contain: none !important;\n  overflow: hidden !important;\n  z-index: 2147483647 !important;\n}\n\n[data-vh-sp-root=\"true\"] video {\n  max-width: 100% !important;\n  max-height: 100% !important;\n}\n\n\n/* Let source players auto-hide their control bars while playback is running. */\n[data-vh-sp-controls-idle=\"true\"] {\n  opacity: 0 !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n  transition: opacity 180ms ease, visibility 180ms linear !important;\n}\n\n/* Hide only source-player fast-forward / rewind controls identified by content.js. */\n[data-vh-sp-suppressed=\"true\"] {\n  display: none !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n}\n\n\n/* Keep the same core Plyr theme tokens as the VisionHub main player. */\n.plyr,\n.plyr .plyr__controls,\n.plyr .plyr__menu__container,\n.plyr .plyr__menu__container *,\n.plyr__menu__container,\n.plyr__menu__container * {\n  --plyr-color-main: #c7f36b !important;\n  --plyr-focus-visible-color: #c7f36b !important;\n  --plyr-control-toggle-checked-background: #c7f36b !important;\n  --plyr-video-control-color: #f5f6f8 !important;\n  --plyr-video-control-color-hover: #f5f6f8 !important;\n  --plyr-video-control-background-hover: #c7f36b !important;\n  --plyr-menu-background: #151820 !important;\n  --plyr-menu-color: #f5f6f8 !important;\n  --plyr-menu-item-arrow-color: #c7f36b !important;\n  --plyr-video-background: #000 !important;\n\n  /* Plyr scrubber and volume range tokens. */\n  --plyr-range-fill-background: #c7f36b !important;\n  --plyr-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-video-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-audio-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-video-progress-buffered-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-audio-progress-buffered-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n  --plyr-video-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n  --plyr-audio-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n\n  /* Scrubber hover tooltip and the settings menu use the same dark theme. */\n  --plyr-tooltip-background: #151820 !important;\n  --plyr-tooltip-color: #f5f6f8 !important;\n}\n\n/* Match the main player's control glyph color even if a source stylesheet overrides its token. */\n.plyr .plyr__controls,\n.plyr .plyr__controls .plyr__control,\n.plyr__controls .plyr__control {\n  color: #f5f6f8 !important;\n}\n\n.plyr .plyr__controls .plyr__control:hover,\n.plyr .plyr__controls .plyr__control:focus,\n.plyr .plyr__controls .plyr__control:focus-visible,\n.plyr__controls .plyr__control:hover,\n.plyr__controls .plyr__control:focus,\n.plyr__controls .plyr__control:focus-visible {\n  color: #f5f6f8 !important;\n  background-color: #c7f36b !important;\n}\n\n/* The large centered play button is separate from .plyr__controls. */\n.plyr .plyr__control--overlaid {\n  background: #c7f36b !important;\n  color: #fff !important;\n}\n\n.plyr .plyr__control--overlaid:hover,\n.plyr .plyr__control--overlaid:focus,\n.plyr .plyr__control--overlaid:focus-visible {\n  background: #c7f36b !important;\n  color: #fff !important;\n}\n\n/* Explicitly scope range tokens to the progress scrubber and volume slider.\n   The variable applies to the fill; avoid setting the whole input background,\n   which would overwrite Plyr's own progress-gradient rendering. */\n.plyr .plyr__progress,\n.plyr .plyr__volume,\n.plyr .plyr__progress input[type=\"range\"],\n.plyr .plyr__volume input[type=\"range\"] {\n  --plyr-color-main: #c7f36b !important;\n  --plyr-range-fill-background: #c7f36b !important;\n  --plyr-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-video-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-audio-range-track-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-video-progress-buffered-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-audio-progress-buffered-background: rgba(255, 255, 255, 0.25) !important;\n  --plyr-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n  --plyr-video-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n  --plyr-audio-range-thumb-active-shadow-color: rgba(199, 243, 107, 0.45) !important;\n}\n\n.plyr .plyr__progress input[type=\"range\"]:focus-visible,\n.plyr .plyr__volume input[type=\"range\"]:focus-visible {\n  outline-color: #c7f36b !important;\n}\n\n/* Match Plyr's own explicit theme selectors, not only the CSS variables. */\n.plyr--full-ui input[type=\"range\"] {\n  color: #c7f36b !important;\n}\n\n.plyr--full-ui input[type=\"range\"].plyr__tab-focus::-webkit-slider-runnable-track {\n  outline-color: #c7f36b !important;\n}\n\n.plyr--full-ui input[type=\"range\"].plyr__tab-focus::-moz-range-track {\n  outline-color: #c7f36b !important;\n}\n\n.plyr--full-ui input[type=\"range\"].plyr__tab-focus::-ms-track {\n  outline-color: #c7f36b !important;\n}\n\n.plyr--video .plyr__control.plyr__tab-focus,\n.plyr--video .plyr__control:hover,\n.plyr--video .plyr__control[aria-expanded=\"true\"],\n.plyr--audio .plyr__control.plyr__tab-focus,\n.plyr--audio .plyr__control:hover,\n.plyr--audio .plyr__control[aria-expanded=\"true\"] {\n  background: #c7f36b !important;\n  color: #fff !important;\n}\n\n.plyr__menu__container .plyr__control[role=\"menuitemradio\"][aria-checked=\"true\"]::before {\n  background: #c7f36b !important;\n}\n\n/* Explicit paint rules cover Plyr builds that do not consume menu CSS tokens consistently. */\n.plyr .plyr__menu__container,\n.plyr .plyr__menu__container [role=\"menu\"],\n.plyr__menu__container,\n.plyr__menu__container [role=\"menu\"] {\n  background-color: #151820 !important;\n  color: #f5f6f8 !important;\n}\n\n.plyr .plyr__menu__container button,\n.plyr .plyr__menu__container [role=\"menuitem\"],\n.plyr .plyr__menu__container [role=\"menuitemradio\"],\n.plyr .plyr__menu__container [role=\"menuitemcheckbox\"],\n.plyr__menu__container button,\n.plyr__menu__container [role=\"menuitem\"],\n.plyr__menu__container [role=\"menuitemradio\"],\n.plyr__menu__container [role=\"menuitemcheckbox\"] {\n  color: #f5f6f8 !important;\n}\n\n.plyr .plyr__menu__container [aria-checked=\"true\"],\n.plyr .plyr__menu__container [aria-pressed=\"true\"],\n.plyr__menu__container [aria-checked=\"true\"],\n.plyr__menu__container [aria-pressed=\"true\"] {\n  background-color: #c7f36b !important;\n  color: #10150a !important;\n}\n";

function createSourcePlayerUiScript(options = {}) {
  const config = {
    playerSelector: typeof options.playerSelector === "string" && options.playerSelector.length <= 300
      ? options.playerSelector
      : "",
    readinessSelector: typeof options.readinessSelector === "string" && options.readinessSelector.length <= 300
      ? options.readinessSelector
      : "",
    css: PLAYER_ONLY_CSS,
  };
  return "(" + runSourcePlayerUi.toString() + ")(" + JSON.stringify(config) + ")";
}

function runSourcePlayerUi(config) {
  "use strict";

  const INSTANCE_KEY = "__visionHubDesktopPlayerUiV1";
  try {
    const existing = window[INSTANCE_KEY];
    if (existing && typeof existing.refresh === "function") {
      existing.refresh();
      return existing.isReady();
    }
  } catch {}

  const CONTROL_AUTO_HIDE_DELAY_MS = 1800;
  const CONTROL_BAR_SELECTOR = [
    ".plyr__controls", ".dplayer-controller", ".jw-controlbar", ".jw-controls",
    ".art-controls", ".xgplayer-controls", ".xgplayer-controls-inner",
    ".vjs-control-bar", ".bpx-player-control-wrap", ".prism-controlbar",
    "[class*='control-bar']", "[class*='ControlBar']", "[class*='controlBar']",
    "[class*='controller']"
  ].join(", ");
  const SEEK_ACTION_SELECTOR = [
    "button", "[role='button']", "a", "[tabindex]", "[onclick]", "[data-plyr]",
    ".dplayer-icon-back", ".dplayer-icon-forward", ".jw-icon-rewind", ".jw-icon-forward",
    "[class*='fast-forward']", "[class*='fastForward']", "[class*='rewind']",
    "[class*='Rewind']", "[class*='backward']", "[class*='Backward']"
  ].join(", ");
  const SEEK_ACTION_PATTERN = /快进|快退|向前跳|向后跳|forward.{0,8}(?:\d+\s*(?:s|sec|seconds|秒)|jump|seek)|(?:\d+\s*(?:s|sec|secs|second|seconds|秒).{0,12})(?:rewind|backward|快退)|rewind|fast[\s_-]*forward|seek[\s_-]*(?:forward|backward|ahead|back)|skip[\s_-]*(?:forward|backward|ahead)|dplayer[-_]icon[-_]back|jw-icon-rewind|jw-icon-forward|data-plyr.{0,12}(?:rewind|fastforward)/i;
  const PLAYER_ROOTS = [
    ".plyr", ".dplayer", ".video-js", ".jwplayer", ".artplayer-app",
    ".xgplayer", ".bpx-player-container", ".prism-player",
    "[class*='video-player']", "[class*='VideoPlayer']", "[class*='player-container']"
  ].join(", ");
  const PLAYER_ONLY_ACTIVE = "data-vh-sp-active";
  const PLAYER_ONLY_HIDDEN = "data-vh-sp-hidden";
  const PLAYER_ONLY_PATH = "data-vh-sp-path";
  const PLAYER_ONLY_ROOT = "data-vh-sp-root";
  const PLAYER_CONTROLS_IDLE = "data-vh-sp-controls-idle";
  const SUPPRESSED_SEEK_CONTROL = "data-vh-sp-suppressed";

  const attachedVideos = new WeakSet();
  const attachedFrames = new WeakSet();
  const controlBehaviorAttached = new WeakSet();
  const controlRootsBound = new WeakSet();
  const controlHideTimers = new WeakMap();
  const hiddenNodes = new Set();
  const pathNodes = new Set();
  const rootNodes = new Set();
  let isolatedPlayerRoot = null;
  let lastReady = false;
  let mutationObserver = null;

  function ensureStyle() {
    const id = "visionhub-desktop-player-ui-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = typeof config.css === "string" ? config.css : "";
    (document.head || document.documentElement).appendChild(style);
  }

  function isVisibleWithBounds(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function isVisibleVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    const style = window.getComputedStyle(video);
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
      })[0] || null;
  }

  function playerRootFor(video) {
    const videoRect = video.getBoundingClientRect();
    const videoArea = Math.max(1, videoRect.width * videoRect.height);
    let best = video.parentElement;
    let bestScore = Number.NEGATIVE_INFINITY;
    let current = video.parentElement;
    let depth = 0;

    while (current && current !== document.body && current !== document.documentElement && depth < 9) {
      const rect = current.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (rect.width >= 100 && rect.height >= 56 && area >= videoArea * 0.8) {
        const className = typeof current.className === "string"
          ? current.className
          : current.getAttribute("class") || "";
        const identity = (current.id || "") + " " + className + " " +
          (current.getAttribute("data-testid") || "");
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
    return Array.from(new Set(bars));
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
      if (!(menu instanceof HTMLElement) || menu.hidden || menu.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(menu);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
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
        setControlBarsIdle(root, false);
        scheduleControlBarsHide(video, root, 300, true);
        return;
      }
      if (waitingForMenuClose) {
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
        node.getAttribute("aria-label"), node.getAttribute("title"), node.getAttribute("data-action"),
        node.getAttribute("data-plyr"), node.getAttribute("alt"), node.textContent
      ].filter(Boolean).join(" "));
    const ownText = element.children.length <= 1 && (element.textContent || "").trim().length <= 48
      ? (element.textContent || "").trim()
      : "";
    return [
      element.id, typeof element.className === "string" ? element.className : element.getAttribute("class"),
      element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("data-action"),
      element.getAttribute("data-plyr"), element.getAttribute("data-title"), element.getAttribute("data-tooltip"),
      ownText, ...nestedLabels
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
      if (control.matches(".plyr__menu__container, .plyr__menu, [role='menu'], [role='dialog']") ||
          control.querySelector(".plyr__menu__container, .plyr__menu, [role='menu'], [role='dialog']")) continue;
      control.setAttribute(SUPPRESSED_SEEK_CONTROL, "true");
    }
  }

  function refreshControls(video) {
    if (!isVisibleVideo(video) || video !== primaryVideo()) return null;
    const root = playerRootFor(video);
    if (!(root instanceof HTMLElement)) return null;
    removeSeekShortcutButtons(root);
    if (!controlRootsBound.has(root)) {
      controlRootsBound.add(root);
      const reveal = () => {
        const activeVideo = primaryVideo() || video;
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

  function attachControlBehavior(video) {
    if (attachedVideos.has(video)) return;
    attachedVideos.add(video);
    video.addEventListener("playing", () => {
      const root = refreshControls(video);
      if (root) {
        setControlBarsIdle(root, false);
        scheduleControlBarsHide(video, root);
      }
      refresh();
    });
    for (const eventName of ["pause", "ended", "waiting", "seeking"]) {
      video.addEventListener(eventName, () => {
        clearControlHideTimer(video);
        const root = refreshControls(video);
        if (root) setControlBarsIdle(root, false);
        refresh();
      });
    }
    video.addEventListener("seeked", () => {
      const root = refreshControls(video);
      if (root && !video.paused && !video.ended) scheduleControlBarsHide(video, root);
    });
    for (const eventName of ["loadedmetadata", "durationchange", "canplay", "timeupdate"]) {
      video.addEventListener(eventName, refresh);
    }
  }

  function clearIsolation() {
    for (const element of hiddenNodes) element.removeAttribute(PLAYER_ONLY_HIDDEN);
    for (const element of pathNodes) element.removeAttribute(PLAYER_ONLY_PATH);
    for (const element of rootNodes) element.removeAttribute(PLAYER_ONLY_ROOT);
    hiddenNodes.clear();
    pathNodes.clear();
    rootNodes.clear();
    document.documentElement.removeAttribute(PLAYER_ONLY_ACTIVE);
    isolatedPlayerRoot = null;
  }

  function isolatePageToPlayer(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected ||
        !document.body || !document.documentElement) return;
    if (isolatedPlayerRoot === element &&
        document.documentElement.getAttribute(PLAYER_ONLY_ACTIVE) === "true") return;
    clearIsolation();

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
      rootNodes.add(element);
    }
    for (const node of chain) {
      if (!node.hasAttribute(PLAYER_ONLY_PATH)) {
        node.setAttribute(PLAYER_ONLY_PATH, "true");
        pathNodes.add(node);
      }
    }
    for (let index = 0; index < chain.length - 1; index += 1) {
      const childOnPath = chain[index];
      const parent = chain[index + 1];
      for (const sibling of parent.children) {
        if (sibling === childOnPath) continue;
        if (parent === document.documentElement && sibling.tagName === "HEAD") continue;
        if (!sibling.hasAttribute(PLAYER_ONLY_HIDDEN)) {
          sibling.setAttribute(PLAYER_ONLY_HIDDEN, "true");
          hiddenNodes.add(sibling);
        }
      }
    }
  }

  function resolveCandidate() {
    let target = null;
    let readinessTarget = null;
    try {
      if (config.playerSelector) target = document.querySelector(config.playerSelector);
      if (config.readinessSelector) readinessTarget = document.querySelector(config.readinessSelector);
    } catch {
      target = null;
      readinessTarget = null;
    }

    const video = primaryVideo();
    if (!target && video) target = playerRootFor(video) || video;
    if (!target && config.playerSelector === "") {
      const frames = Array.from(document.querySelectorAll("iframe")).filter(isVisibleWithBounds);
      if (frames.length === 1) target = frames[0];
    }
    if (!readinessTarget && target) {
      if (target instanceof HTMLVideoElement || target instanceof HTMLIFrameElement) {
        readinessTarget = target;
      } else {
        try { readinessTarget = target.querySelector("video, iframe"); } catch {}
      }
    }
    if (!readinessTarget && video) readinessTarget = video;

    let actualVideo = readinessTarget instanceof HTMLVideoElement ? readinessTarget : null;
    if (!actualVideo && readinessTarget && typeof readinessTarget.querySelector === "function") {
      try { actualVideo = readinessTarget.querySelector("video"); } catch {}
    }
    if (!actualVideo && !(readinessTarget instanceof HTMLIFrameElement) && video) actualVideo = video;

    const targetVisible = isVisibleWithBounds(target);
    const readinessVisible = isVisibleWithBounds(readinessTarget);
    let ready = false;
    if (actualVideo) {
      ready = targetVisible && readinessVisible && isVisibleVideo(actualVideo) &&
        actualVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        actualVideo.videoWidth > 0 && actualVideo.videoHeight > 0;
    } else if (readinessTarget instanceof HTMLIFrameElement) {
      ready = targetVisible && readinessVisible;
    }
    return { target, readinessTarget, video: actualVideo, ready };
  }

  function refresh() {
    ensureStyle();
    for (const video of document.querySelectorAll("video")) attachControlBehavior(video);
    const candidate = resolveCandidate();
    lastReady = candidate.ready;
    if (candidate.ready) {
      const video = primaryVideo();
      const target = candidate.readinessTarget instanceof HTMLIFrameElement
        ? candidate.readinessTarget
        : video ? playerRootFor(video) : candidate.readinessTarget;
      isolatePageToPlayer(target || candidate.target);
      if (video) refreshControls(video);
    }
    // Reapply the player-only view if the site replaces its container or adds page chrome.
    return lastReady;
  }

  const instance = {
    refresh,
    isReady: () => lastReady,
  };

  try {
    Object.defineProperty(window, INSTANCE_KEY, {
      value: instance, configurable: false, enumerable: false, writable: false,
    });
  } catch {}
  refresh();
  if (!mutationObserver) {
    mutationObserver = new MutationObserver(() => refresh());
    mutationObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  }
  return lastReady;
}

module.exports = {
  PLAYER_ONLY_CSS,
  createSourcePlayerUiScript,
};

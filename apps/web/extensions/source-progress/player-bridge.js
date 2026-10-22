(() => {
  "use strict";

  // Runs in MAIN world, but activates only after the isolated extension script
  // has accepted a trusted VisionHub player session.
  const CHANNEL = "visionhub-source-progress-v1";
  const FOCUS_PAUSE_DETECTION_WINDOW_MS = 8000;
  const states = new Map();
  let enabled = false;
  let lastBlurAt = 0;
  let observer = null;

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

  function attachEvents(state) {
    const video = state.video;
    if (state.attached) return;
    state.attached = true;

    video.addEventListener("timeupdate", () => {
      const now = readTime(video);
      const insideBlurWindow = lastBlurAt > 0 && Date.now() - lastBlurAt < 8000;
      if (insideBlurWindow && state.wasPlayingAtBlur &&
          now < state.lastTime - 3 && now < 2) return;
      if (Number.isFinite(now) && now >= 0) state.lastTime = now;
    }, true);

    video.addEventListener("seeked", () => {
      const now = readTime(video);
      if (Number.isFinite(now) && now >= 0) state.lastTime = now;
    }, true);

    video.addEventListener("playing", () => {
      state.lastTime = readTime(video);
      state.wasPlayingAtBlur = false;
      state.pausedByFocusLoss = false;
    }, true);

    video.addEventListener("pause", () => {
      const age = Date.now() - lastBlurAt;
      const lostFocusRecently = lastBlurAt > 0 && age <= FOCUS_PAUSE_DETECTION_WINDOW_MS &&
        (document.hidden || !document.hasFocus() || age < 1200);
      if (state.wasPlayingAtBlur && lostFocusRecently && !video.ended) {
        state.pausedByFocusLoss = true;
      } else if (document.hasFocus() && !document.hidden) {
        state.wasPlayingAtBlur = false;
        state.pausedByFocusLoss = false;
      }
    }, true);
  }

  function scanVideos() {
    if (!enabled) return;
    for (const video of document.querySelectorAll("video")) {
      if (!(video instanceof HTMLVideoElement)) continue;
      let state = states.get(video);
      if (!state) {
        const time = readTime(video);
        state = {
          video,
          lastTime: time > 0 ? time : 0,
          timeAtBlur: 0,
          wasPlayingAtBlur: false,
          pausedByFocusLoss: false,
          attached: false,
        };
        states.set(video, state);
      }
      attachEvents(state);
      if (!video.paused && !video.ended) state.lastTime = readTime(video);
    }
  }

  function noteFocusLoss() {
    const now = Date.now();
    if (lastBlurAt > 0 && now - lastBlurAt < 1200) return;
    lastBlurAt = now;
    for (const state of states.values()) {
      const video = state.video;
      state.wasPlayingAtBlur = !video.paused && !video.ended;
      state.pausedByFocusLoss = false;
      const time = readTime(video);
      state.timeAtBlur = Number.isFinite(time) ? time : state.lastTime;
      if (state.timeAtBlur > 0) state.lastTime = state.timeAtBlur;
    }
  }

  function resumeAfterFocus() {
    if (!enabled || document.hidden) return;
    for (const state of states.values()) {
      const video = state.video;
      if (!state.pausedByFocusLoss) {
        if (!video.paused || video.ended) state.wasPlayingAtBlur = false;
        continue;
      }
      state.pausedByFocusLoss = false;
      state.wasPlayingAtBlur = false;
      if (!video.isConnected || video.ended) continue;

      const target = state.lastTime > 0 ? state.lastTime : state.timeAtBlur;
      const now = readTime(video);
      if (Number.isFinite(target) && target >= 0 &&
          Number.isFinite(video.duration) && target < video.duration - 0.5 &&
          Math.abs(now - target) > 3) setTime(video, target);
      if (video.paused) playVideo(video);
    }
  }

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

  window.addEventListener("blur", noteFocusLoss, true);
  window.addEventListener("focus", resumeAfterFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) noteFocusLoss();
    else resumeAfterFocus();
  }, true);
})();
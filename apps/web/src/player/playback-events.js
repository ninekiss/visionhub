const PLAYBACK_STATES = new Set([
  "ready",
  "playing",
  "paused",
  "buffering",
  "ended",
  "error",
]);

export function bindPlaybackEvents(video, callbacks = {}) {
  const getInitialTime = typeof callbacks.getInitialTime === "function"
    ? callbacks.getInitialTime
    : () => 0;
  let lastProgressReportAt = 0;
  let hasStartedPlayback = false;

  const updateStatus = (state) => {
    if (PLAYBACK_STATES.has(state)) callbacks.onStatus?.(state);
  };

  const reportProgress = (force = false) => {
    const currentTime = video.currentTime;
    const duration = video.duration;
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;

    const now = Date.now();
    if (!force && now - lastProgressReportAt < 5000) return;
    lastProgressReportAt = now;
    callbacks.onProgress?.({ currentTime, duration });
  };

  const handleLoadedMetadata = () => {
    const resumeAt = getInitialTime();
    if (Number.isFinite(resumeAt) && resumeAt > 5 && resumeAt < video.duration - 15) {
      try {
        video.currentTime = resumeAt;
      } catch {
        // Some runtimes reject seeking before the media timeline is ready.
      }
    }
  };

  const handlePlaying = () => {
    hasStartedPlayback = true;
    updateStatus("playing");
  };

  const handleCanPlay = () => {
    if (video.paused && !video.ended) {
      updateStatus(hasStartedPlayback ? "paused" : "ready");
    }
  };

  const handlePause = () => {
    if (!video.ended) updateStatus("paused");
    reportProgress(true);
  };

  const handleTimeUpdate = () => reportProgress();
  const handleWaiting = () => updateStatus("buffering");

  const handleEnded = () => {
    updateStatus("ended");
    reportProgress(true);
  };

  const handleError = () => {
    updateStatus("error");
    callbacks.onError?.();
  };

  const listeners = [
    ["loadedmetadata", handleLoadedMetadata],
    ["playing", handlePlaying],
    ["canplay", handleCanPlay],
    ["pause", handlePause],
    ["timeupdate", handleTimeUpdate],
    ["waiting", handleWaiting],
    ["ended", handleEnded],
    ["error", handleError],
  ];

  for (const [eventName, listener] of listeners) {
    video.addEventListener(eventName, listener);
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const [eventName, listener] of listeners) {
      video.removeEventListener(eventName, listener);
    }
  };
}

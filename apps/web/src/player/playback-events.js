const PLAYBACK_STATES = new Set([
  "ready",
  "playing",
  "paused",
  "buffering",
  "ended",
  "error",
]);

const DEFAULT_PLAYBACK_ERROR = "视频源暂时无法播放。请稍后重试，或返回详情页选择其他内容。";

/** Convert HTMLMediaElement's error code to a useful, source-safe message. */
export function getPlaybackErrorMessage(mediaError, fallbackMessage = DEFAULT_PLAYBACK_ERROR) {
  switch (Number(mediaError?.code)) {
    case 1:
      return "播放已中止，请重试。";
    case 2:
      return "视频加载失败，请检查网络连接或播放源。";
    case 3:
      return "视频数据无法解码，可能是编码格式或媒体文件不受支持。";
    case 4:
      return "当前运行环境不支持此视频格式或编码，或媒体源无效。";
    default:
      return fallbackMessage;
  }
}

export function bindPlaybackEvents(video, callbacks = {})
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
    callbacks.onError?.(video.error ?? null);
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

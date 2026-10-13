import Hls from "hls.js";

const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

export class HlsPlaybackNotSupportedError extends Error {
  constructor() {
    super("This runtime cannot play HLS: neither native ManagedMediaSource HLS nor MSE is supported.");
    this.name = "HlsPlaybackNotSupportedError";
  }
}

function canUseNativeHls(video) {
  const view = video.ownerDocument?.defaultView;
  return Boolean(
    view &&
    typeof view.ManagedMediaSource !== "undefined" &&
    video.canPlayType?.(HLS_MIME_TYPE),
  );
}

function getQualityLevels(hls) {
  const bestByHeight = new Map();
  const levels = Array.isArray(hls.levels) ? hls.levels : [];

  levels.forEach((level, id) => {
    const height = Number(level?.height);
    if (!Number.isFinite(height) || height <= 0) return;

    const rawBitrate = Number(level?.bitrate);
    const candidate = {
      id,
      height,
      bitrate: Number.isFinite(rawBitrate) ? rawBitrate : 0,
      label: String(height) + "p",
    };
    const existing = bestByHeight.get(height);
    if (!existing || candidate.bitrate > existing.bitrate) {
      bestByHeight.set(height, candidate);
    }
  });

  return [...bestByHeight.values()].sort((left, right) => right.height - left.height);
}

function clearVideoSource(video) {
  try {
    video.pause();
  } catch {
    // Still release the source if the runtime rejects pause().
  }
  video.removeAttribute("src");
  video.replaceChildren();
  video.load();
}

export function createHlsAdapter({ HlsConstructor = Hls } = {}) {
  return {
    id: "hls",
    attach(video, source) {
      source.onQualityControlReady?.(null);
      source.onQualityLevelsChange?.([]);

      // Prefer native HLS only when both canPlayType and ManagedMediaSource
      // are present. canPlayType alone is unreliable across Chromium builds.
      if (canUseNativeHls(video)) {
        video.src = source.url;
        video.load();
        let disposed = false;
        return () => {
          if (disposed) return;
          disposed = true;
          clearVideoSource(video);
        };
      }

      if (typeof HlsConstructor.isSupported !== "function" || !HlsConstructor.isSupported()) {
        throw new HlsPlaybackNotSupportedError();
      }

      const hls = new HlsConstructor();
      let disposed = false;
      let fatalErrorReported = false;
      let mediaRecoveryAttempted = false;
      let networkRecoveryAttempted = false;

      const handleHlsError = (_event, data) => {
        if (disposed || fatalErrorReported || !data?.fatal) return;

        if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR && !mediaRecoveryAttempted) {
          mediaRecoveryAttempted = true;
          hls.recoverMediaError();
          return;
        }

        if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR && !networkRecoveryAttempted) {
          networkRecoveryAttempted = true;
          hls.startLoad();
          return;
        }

        fatalErrorReported = true;
        hls.stopLoad?.();
        source.onFatalError?.();
      };

      const publishQualityLevels = () => {
        if (disposed) return;
        source.onQualityLevelsChange?.(getQualityLevels(hls));
      };

      const qualityController = {
        setLevel(levelId) {
          if (disposed) return;
          const nextLevel = Number(levelId);
          if (
            !Number.isInteger(nextLevel) ||
            nextLevel < -1 ||
            nextLevel >= hls.levels.length
          ) {
            return;
          }
          // -1 is Hls.js automatic ABR selection; non-negative values select
          // a specific manifest level and take effect on the next fragment.
          hls.currentLevel = nextLevel;
        },
      };

      source.onQualityControlReady?.(qualityController);
      hls.on(HlsConstructor.Events.ERROR, handleHlsError);
      hls.on(HlsConstructor.Events.MANIFEST_PARSED, publishQualityLevels);
      hls.on(HlsConstructor.Events.LEVELS_UPDATED, publishQualityLevels);
      hls.attachMedia(video);
      hls.loadSource(source.url);

      return () => {
        if (disposed) return;
        disposed = true;
        try {
          hls.off(HlsConstructor.Events.ERROR, handleHlsError);
          hls.off(HlsConstructor.Events.MANIFEST_PARSED, publishQualityLevels);
          hls.off(HlsConstructor.Events.LEVELS_UPDATED, publishQualityLevels);
        } finally {
          try {
            hls.destroy();
          } finally {
            clearVideoSource(video);
          }
        }
      };
    },
  };
}

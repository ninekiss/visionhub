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

      hls.on(HlsConstructor.Events.ERROR, handleHlsError);
      hls.attachMedia(video);
      hls.loadSource(source.url);

      return () => {
        if (disposed) return;
        disposed = true;
        try {
          hls.off(HlsConstructor.Events.ERROR, handleHlsError);
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

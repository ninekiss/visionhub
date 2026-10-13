const MIME_TYPES_BY_EXTENSION = new Map([
  ["mp4", "video/mp4"],
  ["m4v", "video/mp4"],
  ["webm", "video/webm"],
  ["ogv", "video/ogg"],
  ["ogg", "video/ogg"],
  ["m3u8", "application/vnd.apple.mpegurl"],
]);

const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

export class UnsupportedMediaAdapterError extends Error {
  constructor(adapterId) {
    super(adapterId === "hls"
      ? "No HLS media adapter is registered."
      : "No media adapter is registered for this source.");
    this.name = "UnsupportedMediaAdapterError";
    this.adapterId = adapterId;
  }
}

export function inferMediaMimeType(sourceUrl) {
  let pathname = "";

  try {
    pathname = new URL(String(sourceUrl), "https://visionhub.invalid").pathname;
  } catch {
    pathname = String(sourceUrl).split(/[?#]/, 1)[0];
  }

  const extension = pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  // Preserve the previous behavior for extensionless and unknown sources.
  return MIME_TYPES_BY_EXTENSION.get(extension) ?? "video/mp4";
}

export function resolveMediaAdapter(sourceUrl, adapters) {
  const mimeType = inferMediaMimeType(sourceUrl);
  const adapterId = mimeType === HLS_MIME_TYPE ? "hls" : "html5";
  const adapter = adapters?.[adapterId];

  if (!adapter) {
    throw new UnsupportedMediaAdapterError(adapterId);
  }

  return { adapter, adapterId, mimeType };
}

export function createHtml5Adapter() {
  return {
    id: "html5",
    attach(video, source) {
      const sourceElement = video.ownerDocument.createElement("source");
      sourceElement.src = source.url;
      sourceElement.type = source.mimeType;

      const fallbackText = video.ownerDocument.createTextNode(
        "当前浏览器不支持 HTML5 视频播放。",
      );
      video.replaceChildren(sourceElement, fallbackText);
      video.load();

      let detached = false;
      return () => {
        if (detached) return;
        detached = true;

        try {
          video.pause();
        } catch {
          // Continue clearing the source even if a runtime rejects pause().
        }

        video.removeAttribute("src");
        video.replaceChildren();
        video.load();
      };
    },
  };
}

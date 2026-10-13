export type MediaAdapterId = "html5" | "hls";

export interface MediaQualityLevel {
  /** Hls.js level index used by the quality controller. */
  id: number;
  height: number;
  bitrate: number;
  label: string;
}

export interface MediaQualityController {
  /** Set -1 for automatic HLS quality selection or a valid Hls.js level index. */
  setLevel(levelId: number): void;
}

export interface MediaSourceFailure {
  /** The HTML5 media request failed to become playable before its timeout. */
  kind: "load-timeout";
}

export interface MediaSource {
  url: string;
  mimeType: string;
  /** Called for adapter-level fatal errors, such as a media load timeout. */
  onFatalError?: (failure?: MediaSourceFailure) => void;
  /** HLS adapter callback; null indicates manual quality selection is unavailable. */
  onQualityControlReady?: (controller: MediaQualityController | null) => void;
  /** Distinct, known-height HLS renditions currently available in the manifest. */
  onQualityLevelsChange?: (levels: MediaQualityLevel[]) => void;
}

export interface MediaAdapter {
  readonly id: MediaAdapterId;
  attach(video: HTMLVideoElement, source: MediaSource): () => void;
}

export class UnsupportedMediaAdapterError extends Error {
  readonly adapterId: MediaAdapterId;
  constructor(adapterId: MediaAdapterId);
}

export const DEFAULT_HTML5_LOAD_TIMEOUT_MS: number;

export function inferMediaMimeType(sourceUrl: string): string;

export function resolveMediaAdapter(
  sourceUrl: string,
  adapters: Partial<Record<MediaAdapterId, MediaAdapter>>,
): { adapter: MediaAdapter; adapterId: MediaAdapterId; mimeType: string };

export function createHtml5Adapter(options?: {
  /** Timeout before the browser reports media readiness (default 15000ms). */
  loadTimeoutMs?: number;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}): MediaAdapter;

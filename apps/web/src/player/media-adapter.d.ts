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

export interface MediaSource {
  url: string;
  mimeType: string;
  /** Called once when the adapter exhausts its fatal-error recovery attempts. */
  onFatalError?: () => void;
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

export function inferMediaMimeType(sourceUrl: string): string;

export function resolveMediaAdapter(
  sourceUrl: string,
  adapters: Partial<Record<MediaAdapterId, MediaAdapter>>,
): { adapter: MediaAdapter; adapterId: MediaAdapterId; mimeType: string };

export function createHtml5Adapter(): MediaAdapter;

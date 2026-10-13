export type MediaAdapterId = "html5" | "hls";

export interface MediaSource {
  url: string;
  mimeType: string;
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

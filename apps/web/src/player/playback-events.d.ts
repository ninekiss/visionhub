export type PlaybackState = "ready" | "playing" | "paused" | "buffering" | "ended" | "error";

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
}

export interface PlaybackEventCallbacks {
  getInitialTime?: () => number;
  onStatus?: (state: PlaybackState) => void;
  onProgress?: (progress: PlaybackProgress) => void;
  onError?: (error: MediaError | null) => void;
}

/** Bind HTMLMediaElement events and return an idempotent listener cleanup function. */
export function bindPlaybackEvents(
  video: HTMLVideoElement,
  callbacks?: PlaybackEventCallbacks,
): () => void;


/** Return an actionable user-facing message for an HTMLMediaElement error. */
export function getPlaybackErrorMessage(
  mediaError: MediaError | null | undefined,
  fallbackMessage?: string,
): string;

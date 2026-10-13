export interface PlaybackPreferences {
  volume: number;
  playbackRate: number;
}

export const PLAYBACK_SPEED_OPTIONS: readonly number[];
export const DEFAULT_PLAYBACK_PREFERENCES: Readonly<PlaybackPreferences>;

export function readPlaybackPreferences(storage?: Storage | null): PlaybackPreferences;
export function writePlaybackPreferences(
  patch: Partial<PlaybackPreferences>,
  storage?: Storage | null,
): PlaybackPreferences;

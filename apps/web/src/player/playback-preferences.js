export const PLAYBACK_SPEED_OPTIONS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
export const DEFAULT_PLAYBACK_PREFERENCES = Object.freeze({
  volume: 1,
  playbackRate: 1,
});

const STORAGE_KEY = "visionhub:player-preferences:v1";

function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizePreferences(value) {
  const rawVolume = Number(value?.volume);
  const rawPlaybackRate = Number(value?.playbackRate);
  return {
    volume: Number.isFinite(rawVolume)
      ? Math.min(1, Math.max(0, rawVolume))
      : DEFAULT_PLAYBACK_PREFERENCES.volume,
    playbackRate: PLAYBACK_SPEED_OPTIONS.includes(rawPlaybackRate)
      ? rawPlaybackRate
      : DEFAULT_PLAYBACK_PREFERENCES.playbackRate,
  };
}

/** Read settings from this client profile's local storage, falling back safely. */
export function readPlaybackPreferences(storage = getLocalStorage()) {
  if (!storage) return { ...DEFAULT_PLAYBACK_PREFERENCES };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PLAYBACK_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    // Private browsing and custom protocol contexts may reject storage access.
    return { ...DEFAULT_PLAYBACK_PREFERENCES };
  }
}

/** Merge a partial preference update without coupling it to watch-progress data. */
export function writePlaybackPreferences(patch, storage = getLocalStorage()) {
  const current = readPlaybackPreferences(storage);
  const next = normalizePreferences({ ...current, ...patch });
  if (!storage) return next;

  try {
    const serialized = JSON.stringify(next);
    if (storage.getItem(STORAGE_KEY) !== serialized) {
      storage.setItem(STORAGE_KEY, serialized);
    }
  } catch {
    // Playback must continue normally when local storage is unavailable.
  }

  return next;
}

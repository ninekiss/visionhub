const test = require("node:test");
const assert = require("node:assert/strict");

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values,
  };
}

test("uses defaults and merges independent volume and playback-speed updates", async () => {
  const {
    readPlaybackPreferences,
    writePlaybackPreferences,
    DEFAULT_PLAYBACK_PREFERENCES,
  } = await import("../../web/src/player/playback-preferences.js");
  const storage = createMemoryStorage();

  assert.deepEqual(readPlaybackPreferences(storage), DEFAULT_PLAYBACK_PREFERENCES);
  assert.deepEqual(writePlaybackPreferences({ volume: 0.35 }, storage), {
    volume: 0.35,
    playbackRate: 1,
  });
  assert.deepEqual(writePlaybackPreferences({ playbackRate: 1.5 }, storage), {
    volume: 0.35,
    playbackRate: 1.5,
  });
  assert.deepEqual(readPlaybackPreferences(storage), {
    volume: 0.35,
    playbackRate: 1.5,
  });
});

test("clamps volume and rejects unsupported playback speeds or malformed stored data", async () => {
  const { readPlaybackPreferences, writePlaybackPreferences } =
    await import("../../web/src/player/playback-preferences.js");
  const storage = createMemoryStorage();

  assert.deepEqual(writePlaybackPreferences({ volume: 2, playbackRate: 9 }, storage), {
    volume: 1,
    playbackRate: 1,
  });
  assert.deepEqual(writePlaybackPreferences({ volume: -1, playbackRate: 0.5 }, storage), {
    volume: 0,
    playbackRate: 0.5,
  });

  storage.values.set("visionhub:player-preferences:v1", "{invalid json");
  assert.deepEqual(readPlaybackPreferences(storage), { volume: 1, playbackRate: 1 });
});

test("continues with safe values when storage is unavailable or throws", async () => {
  const { readPlaybackPreferences, writePlaybackPreferences } =
    await import("../../web/src/player/playback-preferences.js");
  const throwingStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
  };

  assert.deepEqual(readPlaybackPreferences(null), { volume: 1, playbackRate: 1 });
  assert.deepEqual(writePlaybackPreferences({ volume: 0.2, playbackRate: 2 }, null), {
    volume: 0.2,
    playbackRate: 2,
  });
  assert.deepEqual(readPlaybackPreferences(throwingStorage), { volume: 1, playbackRate: 1 });
  assert.deepEqual(writePlaybackPreferences({ volume: 0.4 }, throwingStorage), {
    volume: 0.4,
    playbackRate: 1,
  });
});

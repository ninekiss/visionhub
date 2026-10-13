const test = require("node:test");
const assert = require("node:assert/strict");

function createFakeVideo() {
  const listeners = new Map();
  return {
    currentTime: 0,
    duration: 100,
    paused: true,
    ended: false,
    addEventListener(name, listener) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
    dispatch(name) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener();
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    },
  };
}

test("playback events report state transitions, restore position, and flush progress on pause/end", async () => {
  const { bindPlaybackEvents } = await import("../../web/src/player/playback-events.js");
  const video = createFakeVideo();
  const states = [];
  const progress = [];
  let errorCount = 0;
  const cleanup = bindPlaybackEvents(video, {
    getInitialTime: () => 20,
    onStatus: (state) => states.push(state),
    onProgress: (value) => progress.push(value),
    onError: () => { errorCount += 1; },
  });

  video.dispatch("loadedmetadata");
  assert.equal(video.currentTime, 20);

  video.paused = false;
  video.dispatch("playing");
  video.dispatch("waiting");
  assert.deepEqual(states.slice(0, 2), ["playing", "buffering"]);

  video.currentTime = 32;
  video.paused = true;
  video.dispatch("pause");
  assert.deepEqual(progress.at(-1), { currentTime: 32, duration: 100 });

  video.currentTime = 95;
  video.ended = true;
  video.dispatch("ended");
  assert.equal(states.at(-1), "ended");
  assert.deepEqual(progress.at(-1), { currentTime: 95, duration: 100 });

  video.dispatch("error");
  assert.equal(states.at(-1), "error");
  assert.equal(errorCount, 1);

  cleanup();
  cleanup();
  assert.equal(video.listenerCount(), 0);
});

test("progress events ignore invalid durations and preserve the first ready state", async () => {
  const { bindPlaybackEvents } = await import("../../web/src/player/playback-events.js");
  const video = createFakeVideo();
  const states = [];
  const progress = [];
  const cleanup = bindPlaybackEvents(video, {
    onStatus: (state) => states.push(state),
    onProgress: (value) => progress.push(value),
  });

  video.duration = Number.NaN;
  video.dispatch("timeupdate");
  assert.equal(progress.length, 0);

  video.duration = 100;
  video.paused = true;
  video.dispatch("canplay");
  assert.deepEqual(states, ["ready"]);

  cleanup();
});


test("maps HTML media errors to actionable messages without exposing source URLs", async () => {
  const { getPlaybackErrorMessage } = await import("../../web/src/player/playback-events.js");
  const fallback = "HLS 流加载失败。请检查播放源、网络连接或稍后重试。";

  assert.equal(getPlaybackErrorMessage({ code: 1 }), "播放已中止，请重试。");
  assert.equal(getPlaybackErrorMessage({ code: 2 }), "视频加载失败，请检查网络连接或播放源。");
  assert.equal(
    getPlaybackErrorMessage({ code: 3 }),
    "视频数据无法解码，可能是编码格式或媒体文件不受支持。",
  );
  assert.equal(
    getPlaybackErrorMessage({ code: 4 }),
    "当前运行环境不支持此视频格式或编码，或媒体源无效。",
  );
  assert.equal(getPlaybackErrorMessage(null, fallback), fallback);
  assert.equal(getPlaybackErrorMessage({ code: 99 }, fallback), fallback);
});

test("passes the media element's error object to playback error callbacks", async () => {
  const { bindPlaybackEvents } = await import("../../web/src/player/playback-events.js");
  const mediaError = { code: 4 };
  const video = createFakeVideo();
  video.error = mediaError;
  let observedError = null;
  const cleanup = bindPlaybackEvents(video, {
    onError: (error) => { observedError = error; },
  });

  video.dispatch("error");
  assert.equal(observedError, mediaError);
  cleanup();
});

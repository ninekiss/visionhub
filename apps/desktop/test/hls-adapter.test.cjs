const test = require("node:test");
const assert = require("node:assert/strict");

class FakeHls {
  static Events = { ERROR: "hls:error" };
  static ErrorTypes = {
    NETWORK_ERROR: "networkError",
    MEDIA_ERROR: "mediaError",
    OTHER_ERROR: "otherError",
  };
  static supported = true;
  static isSupported() { return this.supported; }
  static instances = [];

  constructor() {
    this.calls = [];
    this.listeners = new Map();
    FakeHls.instances.push(this);
  }

  on(name, listener) {
    this.calls.push(["on", name]);
    this.listeners.set(name, listener);
  }

  off(name, listener) {
    this.calls.push(["off", name]);
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }

  attachMedia(video) { this.calls.push(["attachMedia", video]); }
  loadSource(url) { this.calls.push(["loadSource", url]); }
  startLoad() { this.calls.push(["startLoad"]); }
  recoverMediaError() { this.calls.push(["recoverMediaError"]); }
  stopLoad() { this.calls.push(["stopLoad"]); }
  destroy() { this.calls.push(["destroy"]); }

  emit(name, data) {
    this.listeners.get(name)?.(name, data);
  }
}

function createFakeVideo({ managedMediaSource = false, nativeHls = "" } = {}) {
  const calls = [];
  const view = {};
  if (managedMediaSource) view.ManagedMediaSource = class ManagedMediaSource {};
  return {
    calls,
    ownerDocument: { defaultView: view },
    children: [],
    src: "",
    canPlayType: () => nativeHls,
    replaceChildren(...children) {
      this.children = children;
      calls.push(["replaceChildren", children.length]);
    },
    load() { calls.push(["load"]); },
    pause() { calls.push(["pause"]); },
    removeAttribute(name) {
      calls.push(["removeAttribute", name]);
      if (name === "src") this.src = "";
    },
  };
}

test("uses native HLS only when ManagedMediaSource and canPlayType are both available", async () => {
  const { createHlsAdapter } = await import("../../web/src/player/hls-adapter.js");
  FakeHls.instances = [];
  const video = createFakeVideo({ managedMediaSource: true, nativeHls: "maybe" });
  const detach = createHlsAdapter({ HlsConstructor: FakeHls }).attach(video, {
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    mimeType: "application/vnd.apple.mpegurl",
  });

  assert.equal(video.src, "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
  assert.equal(video.calls.filter(([name]) => name === "load").length, 1);
  assert.equal(FakeHls.instances.length, 0);

  detach();
  detach();
  assert.equal(video.src, "");
  assert.equal(video.calls.filter(([name]) => name === "pause").length, 1);
  assert.equal(video.calls.filter(([name]) => name === "load").length, 2);
});

test("uses hls.js, attempts a single network recovery, reports a persistent fatal error and cleans up", async () => {
  const { createHlsAdapter } = await import("../../web/src/player/hls-adapter.js");
  FakeHls.instances = [];
  FakeHls.supported = true;
  const video = createFakeVideo();
  let fatalErrorCount = 0;
  const streamUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
  const detach = createHlsAdapter({ HlsConstructor: FakeHls }).attach(video, {
    url: streamUrl,
    mimeType: "application/vnd.apple.mpegurl",
    onFatalError: () => { fatalErrorCount += 1; },
  });

  const hls = FakeHls.instances[0];
  assert.deepEqual(hls.calls.slice(0, 3).map(([name]) => name), ["on", "attachMedia", "loadSource"]);
  assert.ok(hls.calls.some(([name, value]) => name === "loadSource" && value === streamUrl));

  hls.emit(FakeHls.Events.ERROR, { fatal: false, type: FakeHls.ErrorTypes.NETWORK_ERROR });
  assert.equal(hls.calls.filter(([name]) => name === "startLoad").length, 0);

  hls.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.NETWORK_ERROR });
  assert.equal(hls.calls.filter(([name]) => name === "startLoad").length, 1);
  hls.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.NETWORK_ERROR });
  hls.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.OTHER_ERROR });

  assert.equal(fatalErrorCount, 1);
  assert.equal(hls.calls.filter(([name]) => name === "stopLoad").length, 1);

  detach();
  detach();
  assert.equal(hls.calls.filter(([name]) => name === "off").length, 1);
  assert.equal(hls.calls.filter(([name]) => name === "destroy").length, 1);
  assert.equal(video.src, "");
  assert.equal(video.calls.filter(([name]) => name === "pause").length, 1);
});

test("attempts one media recovery before surfacing another fatal media error", async () => {
  const { createHlsAdapter } = await import("../../web/src/player/hls-adapter.js");
  FakeHls.instances = [];
  FakeHls.supported = true;
  const video = createFakeVideo();
  let fatalErrorCount = 0;
  const detach = createHlsAdapter({ HlsConstructor: FakeHls }).attach(video, {
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    mimeType: "application/vnd.apple.mpegurl",
    onFatalError: () => { fatalErrorCount += 1; },
  });
  const hls = FakeHls.instances[0];

  hls.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.MEDIA_ERROR });
  assert.equal(hls.calls.filter(([name]) => name === "recoverMediaError").length, 1);
  assert.equal(fatalErrorCount, 0);

  hls.emit(FakeHls.Events.ERROR, { fatal: true, type: FakeHls.ErrorTypes.MEDIA_ERROR });
  assert.equal(fatalErrorCount, 1);

  detach();
});

test("fails clearly without assigning a source when the runtime has no HLS playback support", async () => {
  const { createHlsAdapter, HlsPlaybackNotSupportedError } =
    await import("../../web/src/player/hls-adapter.js");
  FakeHls.instances = [];
  FakeHls.supported = false;
  const video = createFakeVideo();

  assert.throws(
    () => createHlsAdapter({ HlsConstructor: FakeHls }).attach(video, {
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      mimeType: "application/vnd.apple.mpegurl",
    }),
    (error) => error instanceof HlsPlaybackNotSupportedError && !error.message.includes("test-streams"),
  );
  assert.equal(video.src, "");
  assert.equal(FakeHls.instances.length, 0);
});

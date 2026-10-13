const test = require("node:test");
const assert = require("node:assert/strict");

test("media type inference ignores query strings and handles known extensions", async () => {
  const { inferMediaMimeType } = await import("../../web/src/player/media-adapter.js");

  assert.equal(inferMediaMimeType("https://media.test/movie.MP4?token=secret"), "video/mp4");
  assert.equal(inferMediaMimeType("https://media.test/episode.webm?download=1"), "video/webm");
  assert.equal(inferMediaMimeType("https://media.test/clip.ogv#preview"), "video/ogg");
  assert.equal(inferMediaMimeType("https://media.test/stream.m3u8?auth=secret"), "application/vnd.apple.mpegurl");
  assert.equal(inferMediaMimeType("https://media.test/video"), "video/mp4");
  assert.equal(inferMediaMimeType("https://media.test/file.unknown"), "video/mp4");
});

test("adapter selection uses HTML5 for standard media and reports missing HLS adapter clearly", async () => {
  const {
    createHtml5Adapter,
    resolveMediaAdapter,
    UnsupportedMediaAdapterError,
  } = await import("../../web/src/player/media-adapter.js");

  const html5 = createHtml5Adapter();
  const selected = resolveMediaAdapter("https://media.test/movie.mp4", { html5 });
  assert.equal(selected.adapter, html5);
  assert.equal(selected.adapterId, "html5");
  assert.equal(selected.mimeType, "video/mp4");

  assert.throws(
    () => resolveMediaAdapter("https://media.test/live.m3u8?token=secret", { html5 }),
    (error) => error instanceof UnsupportedMediaAdapterError
      && error.adapterId === "hls"
      && /HLS media adapter/.test(error.message)
      && !error.message.includes("secret"),
  );

  const hls = { id: "hls", attach: () => () => {} };
  assert.equal(
    resolveMediaAdapter("https://media.test/live.m3u8", { html5, hls }).adapter,
    hls,
  );
});

test("HTML5 adapter attaches a typed source and releases media resources idempotently", async () => {
  const { createHtml5Adapter } = await import("../../web/src/player/media-adapter.js");
  const operations = [];
  const listeners = new Map();
  const video = {
    children: [],
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
    ownerDocument: {
      createElement(name) {
        return { tagName: name.toUpperCase(), src: "", type: "" };
      },
      createTextNode(text) {
        return { nodeType: 3, textContent: text };
      },
    },
    replaceChildren(...children) {
      this.children = children;
      operations.push(["replaceChildren", children.length]);
    },
    load() {
      operations.push(["load"]);
    },
    pause() {
      operations.push(["pause"]);
    },
    removeAttribute(name) {
      operations.push(["removeAttribute", name]);
    },
  };

  const detach = createHtml5Adapter().attach(video, {
    url: "https://media.test/movie.webm",
    mimeType: "video/webm",
  });

  assert.equal(video.children[0].tagName, "SOURCE");
  assert.equal(video.children[0].src, "https://media.test/movie.webm");
  assert.equal(video.children[0].type, "video/webm");
  assert.equal(video.children.length, 2);
  assert.equal(operations.filter(([name]) => name === "load").length, 1);

  detach();
  detach();

  assert.equal(video.children.length, 0);
  assert.deepEqual(
    operations.filter(([name]) => name === "removeAttribute"),
    [["removeAttribute", "src"]],
  );
  assert.equal(operations.filter(([name]) => name === "pause").length, 1);
  assert.equal(operations.filter(([name]) => name === "load").length, 2);
});


test("reports a fatal load timeout if an HTML5 source never becomes playable", async () => {
  const { createHtml5Adapter } = await import("../../web/src/player/media-adapter.js");
  const listeners = new Map();
  const operations = [];
  let onTimeout = null;
  const cancelled = [];
  const video = {
    children: [],
    addEventListener(name, listener) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    listenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    },
    ownerDocument: {
      createElement: (name) => ({ tagName: name.toUpperCase(), src: "", type: "" }),
      createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    },
    replaceChildren(...children) { this.children = children; },
    load() { operations.push("load"); },
    pause() { operations.push("pause"); },
    removeAttribute(name) { operations.push(["removeAttribute", name]); },
  };
  let reportedFailure = null;
  const adapter = createHtml5Adapter({
    loadTimeoutMs: 25,
    scheduleTimeout(callback, delay) {
      assert.equal(delay, 25);
      onTimeout = callback;
      return "fake-timeout";
    },
    cancelTimeout(handle) { cancelled.push(handle); },
  });

  const detach = adapter.attach(video, {
    url: "https://unreachable.invalid/video.mp4",
    mimeType: "video/mp4",
    onFatalError: (failure) => { reportedFailure = failure; },
  });

  assert.equal(reportedFailure, null);
  assert.equal(typeof onTimeout, "function");
  onTimeout();
  assert.deepEqual(reportedFailure, { kind: "load-timeout" });

  detach();
  detach();
  assert.equal(video.listenerCount(), 0);
  assert.equal(cancelled.includes("fake-timeout"), false);
  assert.equal(operations.filter((item) => item === "pause").length, 1);
});

test("cancels the initial-load timeout as soon as playable media data arrives", async () => {
  const { createHtml5Adapter } = await import("../../web/src/player/media-adapter.js");
  const listeners = new Map();
  let onTimeout = null;
  const cancelled = [];
  let fatalCount = 0;
  const video = {
    children: [],
    addEventListener(name, listener) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name) { for (const listener of [...(listeners.get(name) ?? [])]) listener(); },
    ownerDocument: {
      createElement: (name) => ({ tagName: name.toUpperCase(), src: "", type: "" }),
      createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    },
    replaceChildren(...children) { this.children = children; },
    load() {},
    pause() {},
    removeAttribute() {},
  };
  const detach = createHtml5Adapter({
    loadTimeoutMs: 25,
    scheduleTimeout(callback) { onTimeout = callback; return 9; },
    cancelTimeout(handle) { cancelled.push(handle); },
  }).attach(video, {
    url: "https://media.test/valid.mp4",
    mimeType: "video/mp4",
    onFatalError: () => { fatalCount += 1; },
  });

  video.dispatch("canplay");
  assert.deepEqual(cancelled, [9]);
  onTimeout();
  assert.equal(fatalCount, 0);
  detach();
});

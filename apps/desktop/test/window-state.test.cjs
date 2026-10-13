const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  normalizeWindowState,
  readWindowState,
  writeWindowState,
} = require("../src/window-state.cjs");

const displays = [
  { id: 1, primary: true, workArea: { x: 0, y: 0, width: 1440, height: 900 } },
  { id: 2, primary: false, workArea: { x: 1440, y: -100, width: 1280, height: 900 } },
];

test("first-run window state is centered inside the primary display work area", () => {
  assert.deepEqual(normalizeWindowState(null, displays), {
    x: 80,
    y: 40,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    isMaximized: false,
  });
});

test("first-run defaults center on the primary display even when it is not at the origin", () => {
  const offsetDisplays = [
    { id: 1, primary: false, workArea: { x: 0, y: 0, width: 1440, height: 900 } },
    { id: 2, primary: true, workArea: { x: 1440, y: -200, width: 1600, height: 1000 } },
  ];
  assert.deepEqual(normalizeWindowState(null, offsetDisplays), {
    x: 1600,
    y: -110,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    isMaximized: false,
  });
});

test("valid secondary-display bounds and maximized state are restored", () => {
  assert.deepEqual(normalizeWindowState({
    x: 1500,
    y: 10,
    width: 1180,
    height: 720,
    isMaximized: true,
  }, displays), {
    x: 1500,
    y: 10,
    width: 1180,
    height: 720,
    isMaximized: true,
  });
});

test("off-screen coordinates are clamped to a connected display after monitor changes", () => {
  const restored = normalizeWindowState({
    x: -9000,
    y: -7000,
    width: 1600,
    height: 1100,
    isMaximized: false,
  }, displays);
  assert.ok(restored.x >= 0);
  assert.ok(restored.y >= 0);
  assert.ok(restored.x + restored.width <= 1440);
  assert.ok(restored.y + restored.height <= 900);
});

test("invalid values fall back to safe defaults and ignore non-boolean maximized flags", () => {
  assert.deepEqual(normalizeWindowState({
    x: "off-screen",
    y: null,
    width: -50,
    height: Number.NaN,
    isMaximized: "true",
  }), {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    isMaximized: false,
  });
});

test("restored bounds fit a smaller display without exceeding its work area", () => {
  const smallDisplay = [{ primary: true, workArea: { x: 0, y: 0, width: 600, height: 400 } }];
  assert.deepEqual(normalizeWindowState({ width: 1200, height: 800 }, smallDisplay), {
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    isMaximized: false,
  });
});

test("window state is saved atomically and loaded through display validation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visionhub-window-state-"));
  const filePath = join(directory, "preferences", "window-state.json");
  try {
    writeWindowState(filePath, {
      x: 220,
      y: 90,
      width: 1100,
      height: 740,
      isMaximized: true,
    });
    assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), {
      width: 1100,
      height: 740,
      isMaximized: true,
      x: 220,
      y: 90,
    });
    assert.deepEqual(readWindowState(filePath, displays), {
      x: 220,
      y: 90,
      width: 1100,
      height: 740,
      isMaximized: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing or malformed persisted state never prevents startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "visionhub-window-state-invalid-"));
  const missing = join(directory, "missing.json");
  const malformed = join(directory, "malformed.json");
  try {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(malformed, "{bad json"));
    assert.deepEqual(readWindowState(missing, displays), normalizeWindowState(null, displays));
    assert.deepEqual(readWindowState(malformed, displays), normalizeWindowState(null, displays));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

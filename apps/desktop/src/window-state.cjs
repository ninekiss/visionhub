const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 820;
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 480;
const MAX_WINDOW_DIMENSION = 10000;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safeDimension(value, fallback) {
  if (!isFiniteNumber(value) || value <= 0) return fallback;
  return Math.min(MAX_WINDOW_DIMENSION, Math.max(1, Math.round(value)));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function validDisplays(displays) {
  if (!Array.isArray(displays)) return [];
  return displays.filter((display) => {
    const area = display && display.workArea;
    return area &&
      isFiniteNumber(area.x) &&
      isFiniteNumber(area.y) &&
      isFiniteNumber(area.width) &&
      isFiniteNumber(area.height) &&
      area.width > 0 &&
      area.height > 0;
  });
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function chooseDisplay(candidateBounds, displays) {
  if (!displays.length) return null;

  const hasPosition = isFiniteNumber(candidateBounds.x) && isFiniteNumber(candidateBounds.y);
  if (!hasPosition) return displays.find((display) => display.primary) || displays[0];

  let selected = null;
  let highestIntersection = 0;
  for (const display of displays) {
    const area = intersectionArea(candidateBounds, display.workArea);
    if (area > highestIntersection) {
      selected = display;
      highestIntersection = area;
    }
  }

  // A removed monitor or corrupted coordinates must never leave the window off-screen.
  return selected || displays.find((display) => display.primary) || displays[0];
}

function normalizeWindowState(candidate, displays = []) {
  const source = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate
    : {};
  const requestedWidth = safeDimension(source.width, DEFAULT_WINDOW_WIDTH);
  const requestedHeight = safeDimension(source.height, DEFAULT_WINDOW_HEIGHT);
  const result = {
    width: requestedWidth,
    height: requestedHeight,
    isMaximized: source.isMaximized === true,
  };

  if (isFiniteNumber(source.x)) result.x = Math.round(source.x);
  if (isFiniteNumber(source.y)) result.y = Math.round(source.y);

  const availableDisplays = validDisplays(displays);
  if (!availableDisplays.length) {
    result.width = Math.max(MIN_WINDOW_WIDTH, requestedWidth);
    result.height = Math.max(MIN_WINDOW_HEIGHT, requestedHeight);
    return result;
  }

  const selectedDisplay = chooseDisplay({
    x: isFiniteNumber(source.x) ? source.x : 0,
    y: isFiniteNumber(source.y) ? source.y : 0,
    width: requestedWidth,
    height: requestedHeight,
  }, availableDisplays);
  const area = selectedDisplay.workArea;
  const minWidth = Math.min(MIN_WINDOW_WIDTH, area.width);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, area.height);
  result.width = Math.round(clamp(requestedWidth, minWidth, area.width));
  result.height = Math.round(clamp(requestedHeight, minHeight, area.height));

  const defaultX = area.x + Math.floor((area.width - result.width) / 2);
  const defaultY = area.y + Math.floor((area.height - result.height) / 2);
  const x = isFiniteNumber(source.x) ? source.x : defaultX;
  const y = isFiniteNumber(source.y) ? source.y : defaultY;
  result.x = Math.round(clamp(x, area.x, area.x + area.width - result.width));
  result.y = Math.round(clamp(y, area.y, area.y + area.height - result.height));
  return result;
}

function readWindowState(filePath, displays = []) {
  let candidate = null;
  try {
    candidate = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    // Missing or malformed state is normal for first launch and must not block startup.
  }
  return normalizeWindowState(candidate, displays);
}

function writeWindowState(filePath, state) {
  if (!state || typeof state !== "object") throw new TypeError("Window state must be an object.");
  const width = safeDimension(state.width, DEFAULT_WINDOW_WIDTH);
  const height = safeDimension(state.height, DEFAULT_WINDOW_HEIGHT);
  const payload = {
    width,
    height,
    isMaximized: state.isMaximized === true,
  };
  if (isFiniteNumber(state.x)) payload.x = Math.round(state.x);
  if (isFiniteNumber(state.y)) payload.y = Math.round(state.y);

  const directory = path.dirname(filePath);
  const temporaryPath = filePath + "." + process.pid + ".tmp";
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

module.exports = {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeWindowState,
  readWindowState,
  writeWindowState,
};

const { readdir, stat } = require("node:fs/promises");
const path = require("node:path");

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Find unpacked Chrome extensions in a configured folder.
 * The root may be a single extension, a folder of extensions, or a browser
 * profile Extensions directory (<extension-id>/<version>/manifest.json).
 */
async function discoverUnpackedExtensions(directory) {
  if (typeof directory !== "string" || !directory.trim()) return [];

  const root = path.resolve(directory);
  let rootStats;
  try {
    rootStats = await stat(root);
  } catch {
    throw new Error("The configured browser extension directory does not exist or is not accessible.");
  }
  if (!rootStats.isDirectory()) {
    throw new TypeError("The configured browser extension path must be a directory.");
  }

  const matches = [];
  async function visit(currentDirectory, depth) {
    let entries;
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true });
    } catch {
      if (currentDirectory === root) {
        throw new Error("The configured browser extension directory cannot be read.");
      }
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === "manifest.json")) {
      matches.push(currentDirectory);
      if (matches.length > 100) {
        throw new Error("The configured browser extension directory contains more than 100 extensions.");
      }
      return;
    }

    // Chrome profile folders normally nest an extension ID and version below
    // Extensions/. Bound traversal so an arbitrary path cannot trigger a full
    // disk scan. Symlink entries are deliberately not followed.
    if (depth >= 3) return;
    const children = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      await visit(path.join(currentDirectory, child.name), depth + 1);
    }
  }

  await visit(root, 0);
  return matches.sort((left, right) => left.localeCompare(right));
}

function resolveProviderUrl(provider, contentId) {
  if (!provider || typeof provider.id !== "string" || typeof provider.urlTemplate !== "string") {
    throw new TypeError("The selected playback provider is not configured.");
  }
  if (typeof contentId !== "string" || !contentId.trim() || contentId.length > 512) {
    throw new TypeError("A valid external content ID is required.");
  }
  if (!Array.isArray(provider.allowedOrigins) || provider.allowedOrigins.length === 0) {
    throw new TypeError("The selected provider has no allowed HTTPS origins.");
  }
  const replaced = provider.urlTemplate.replaceAll("{contentId}", encodeURIComponent(contentId.trim()));
  if (replaced.includes("{") || replaced.includes("}")) {
    throw new TypeError("The provider URL template contains unsupported template variables.");
  }
  let url;
  try {
    url = new URL(replaced);
  } catch {
    throw new TypeError("The configured provider URL template is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      !provider.allowedOrigins.includes(url.origin)) {
    throw new TypeError("The generated source URL is outside the provider's HTTPS allowlist.");
  }
  return url.href;
}

function isValidExternalPlayerRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9:._-]{1,160}$/.test(value);
}

function canShowExternalPlayer({ ready, visible, htmlFullscreen }) {
  return ready === true && (htmlFullscreen === true || visible === true);
}

function validateExternalPlayerBounds(value) {
  if (!isRecord(value)) throw new TypeError("Invalid external-player bounds.");
  for (const key of ["x", "y", "width", "height"]) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      throw new TypeError("External-player bounds must contain finite numbers.");
    }
  }
  const x = Math.round(value.x);
  const y = Math.round(value.y);
  const width = Math.round(value.width);
  const height = Math.round(value.height);
  // Negative origins are valid for a child view partially scrolled beyond
  // the renderer viewport. Electron clips the child view to its parent.
  if (x < -20000 || y < -20000 || x > 20000 || y > 20000 ||
      width < 1 || height < 1 || width > 20000 || height > 20000) {
    throw new TypeError("External-player bounds are outside the accepted range.");
  }
  if (value.visible !== undefined && typeof value.visible !== "boolean") {
    throw new TypeError("External-player visibility must be a boolean.");
  }
  return { x, y, width, height, visible: value.visible !== false };
}

/** Build a fixed script that only queries CSS selectors supplied by validated local configuration. */
function createPlayerIsolationScript(playerSelector, readinessSelector) {
  const player = JSON.stringify(playerSelector);
  const ready = JSON.stringify(readinessSelector || playerSelector);
  return `(() => {
    let target;
    let readinessTarget;
    try {
      readinessTarget = document.querySelector(${ready});
      if (!readinessTarget) return false;
      target = document.querySelector(${player});
    } catch {
      return false;
    }
    if (!target || target === document.documentElement || target === document.body) return false;

    const isVisibleWithBounds = (element) => {
      if (!(element instanceof Element) || !element.isConnected) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    // Do not start the display grace period for a selector that merely exists
    // in the DOM but is hidden, collapsed, or has not been laid out yet.
    if (!isVisibleWithBounds(target) || !isVisibleWithBounds(readinessTarget)) return false;

    // A matched <video> element is not necessarily displaying a frame yet.
    const video = readinessTarget instanceof HTMLVideoElement
      ? readinessTarget
      : readinessTarget.querySelector?.("video");
    if (video && (
      !isVisibleWithBounds(video) ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    )) return false;

    let branch = target;
    while (branch && branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch) sibling.style.setProperty("display", "none", "important");
      }
      if (parent === document.body) break;
      branch = parent;
    }

    const root = document.documentElement;
    const body = document.body;
    for (const element of [root, body]) {
      element.style.setProperty("width", "100%", "important");
      element.style.setProperty("height", "100%", "important");
      element.style.setProperty("min-width", "0", "important");
      element.style.setProperty("min-height", "0", "important");
      element.style.setProperty("margin", "0", "important");
      element.style.setProperty("padding", "0", "important");
      element.style.setProperty("overflow", "hidden", "important");
      element.style.setProperty("background", "#000", "important");
    }
    target.style.setProperty("position", "fixed", "important");
    target.style.setProperty("inset", "0", "important");
    target.style.setProperty("width", "100vw", "important");
    target.style.setProperty("height", "100vh", "important");
    target.style.setProperty("max-width", "none", "important");
    target.style.setProperty("max-height", "none", "important");
    target.style.setProperty("margin", "0", "important");
    target.style.setProperty("z-index", "2147483647", "important");
    return true;
  })()`;
}

function providerOriginAllowed(urlValue, provider) {
  try {
    const url = new URL(urlValue);
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      Array.isArray(provider?.allowedOrigins) &&
      provider.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

module.exports = {
  canShowExternalPlayer,
  discoverUnpackedExtensions,
  createPlayerIsolationScript,
  isValidExternalPlayerRequestId,
  providerOriginAllowed,
  resolveProviderUrl,
  validateExternalPlayerBounds,
};

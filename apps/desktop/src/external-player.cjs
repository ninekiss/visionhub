function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

    // A matched <video> element is not necessarily displaying a frame yet.
    const video = readinessTarget instanceof HTMLVideoElement
      ? readinessTarget
      : readinessTarget.querySelector?.("video");
    if (video && (
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
  createPlayerIsolationScript,
  isValidExternalPlayerRequestId,
  providerOriginAllowed,
  resolveProviderUrl,
  validateExternalPlayerBounds,
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseDevelopmentServerUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) || !url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function createWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    // This desktop build intentionally embeds authorized source sites with a DOM <webview>.
    webviewTag: true,
  };
}

function createPackagedRendererCsp(apiBaseUrl) {
  // Plyr loads its SVG icon sprite with fetch(); packaged CSP must allow its documented sprite origin.
  // HLS manifests and media segments may use independent HTTPS CDN hosts.
  // HTTP is still allowed only for the explicitly configured API origin below.
  const connectSources = ["'self'", "https://cdn.plyr.io"];
  if (apiBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl);
      if (
        (apiUrl.protocol === "http:" || apiUrl.protocol === "https:") &&
        !apiUrl.username &&
        !apiUrl.password
      ) {
        connectSources.push(apiUrl.origin);
      }
    } catch {
      // An invalid endpoint is not added to the policy; runtime config validation is separate.
    }
  }

  connectSources.push("https:");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // The app's main frame remains trusted; the Electron main process separately allowlists every webview src.
    "frame-src https:",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' blob: https:",
    "connect-src " + connectSources.join(" "),
  ].join("; ");
}

function getSafeExternalUrl(candidate) {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isTrustedRendererUrl(candidate, options) {
  try {
    const candidateUrl = new URL(candidate);
    if (options.developmentUrl) {
      const devServer = parseDevelopmentServerUrl(options.developmentUrl);
      if (!devServer) return false;
      return candidateUrl.origin === devServer.origin;
    }

    const packagedUrl = new URL(options.packagedUrl);
    if (packagedUrl.protocol === "file:") return candidateUrl.href === packagedUrl.href;
    return candidateUrl.protocol === packagedUrl.protocol &&
      candidateUrl.hostname === packagedUrl.hostname &&
      candidateUrl.port === packagedUrl.port &&
      !candidateUrl.username &&
      !candidateUrl.password;
  } catch {
    return false;
  }
}

module.exports = {
  createPackagedRendererCsp,
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
};

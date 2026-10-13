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
    webviewTag: false,
  };
}

function createPackagedRendererCsp(apiBaseUrl) {
  const connectSources = ["'self'"];
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

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' blob: https:",
    "connect-src " + connectSources.join(" "),
  ].join("; ");
}

function applyContentSecurityPolicy(responseHeaders, policy) {
  const headers = Object.fromEntries(
    Object.entries(responseHeaders || {}).filter(
      ([name]) => name.toLowerCase() !== "content-security-policy",
    ),
  );
  headers["Content-Security-Policy"] = [policy];
  return headers;
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
    if (options.developmentUrl) {
      const devServer = parseDevelopmentServerUrl(options.developmentUrl);
      if (!devServer) return false;
      return new URL(candidate).origin === devServer.origin;
    }
    return new URL(candidate).href === new URL(options.packagedUrl).href;
  } catch {
    return false;
  }
}

module.exports = {
  applyContentSecurityPolicy,
  createPackagedRendererCsp,
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
};

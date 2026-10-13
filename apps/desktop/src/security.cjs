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
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
};

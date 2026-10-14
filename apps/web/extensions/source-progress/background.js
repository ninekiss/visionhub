const STORAGE_KEY = "visionHubDiscoveredOriginsByApp";

const ENABLED_SOURCE_ORIGINS_KEY = "visionHubEnabledSourceOrigins";

function sourceScriptIdFor(origin) {
  return "vh-source-progress-" + origin.replace(/[^a-zA-Z0-9]/g, "-");
}

async function refreshRegisteredSourceScripts() {
  const stored = await chrome.storage.local.get(ENABLED_SOURCE_ORIGINS_KEY);
  const enabledOrigins = Array.isArray(stored[ENABLED_SOURCE_ORIGINS_KEY])
    ? stored[ENABLED_SOURCE_ORIGINS_KEY]
    : [];
  for (const value of enabledOrigins) {
    const origin = normalizedSourceOrigin(value);
    if (!origin) continue;
    const pattern = origin + "/*";
    const allowed = await chrome.permissions.contains({ origins: [pattern] }).catch(() => false);
    if (!allowed) continue;

    const id = sourceScriptIdFor(origin);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    await chrome.scripting.registerContentScripts([{
      id,
      matches: [pattern],
      css: ["player-only.css"],
      js: ["content.js"],
      allFrames: true,
      runAt: "document_idle",
      persistAcrossSessions: true,
    }]);
  }
}

// Upgrade registrations after unpacked-extension reloads or extension updates,
// so existing grants pick up the player-only stylesheet without reauthorization.
chrome.runtime.onInstalled.addListener(() => {
  void refreshRegisteredSourceScripts().catch(() => {});
});


function normalizedSourceOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin === "null") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizedAppOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.origin;
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) return url.origin;
    return null;
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "VH_SOURCE_PROGRESS_DISCOVERED_FRAMES") return false;

  const topOrigin = normalizedAppOrigin(message.topOrigin);
  const origins = Array.isArray(message.origins)
    ? [...new Set(message.origins.map(normalizedSourceOrigin).filter(Boolean))]
    : [];
  if (!topOrigin || origins.length === 0) return false;

  chrome.storage.local.get(STORAGE_KEY).then((stored) => {
    const all = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
      ? stored[STORAGE_KEY]
      : {};
    const next = [...new Set([...(Array.isArray(all[topOrigin]) ? all[topOrigin] : []), ...origins])].slice(0, 100);
    return chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...all,
        [topOrigin]: next,
      },
    });
  }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));

  return true;
});

const STORAGE_KEY = "visionHubDiscoveredOriginsByApp";

const ENABLED_SOURCE_ORIGINS_KEY = "visionHubEnabledSourceOrigins";
const TRUSTED_APP_ORIGINS_KEY = "visionHubTrustedAppOrigins";
const IGNORE_FRAME_RESTRICTIONS_KEY = "visionHubIgnoreFrameRestrictionsEnabled";
const FRAME_RULE_ID_BASE = 20000;
const FRAME_RULE_LIMIT = 100;

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
    const bridgeId = id + "-main";
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id, bridgeId] });
    if (existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: existing.map((script) => script.id) });
    }
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        css: ["player-only.css"],
        js: ["content.js"],
        allFrames: true,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
      {
        id: bridgeId,
        matches: [pattern],
        js: ["player-bridge.js"],
        allFrames: true,
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true,
      },
    ]);
  }
}


async function refreshFrameRestrictionRules() {
  const stored = await chrome.storage.local.get([
    ENABLED_SOURCE_ORIGINS_KEY,
    TRUSTED_APP_ORIGINS_KEY,
    IGNORE_FRAME_RESTRICTIONS_KEY,
  ]);
  const enabled = stored[IGNORE_FRAME_RESTRICTIONS_KEY] === true;
  const sourceOrigins = Array.isArray(stored[ENABLED_SOURCE_ORIGINS_KEY])
    ? [...new Set(stored[ENABLED_SOURCE_ORIGINS_KEY].map(normalizedSourceOrigin).filter(Boolean))].slice(0, FRAME_RULE_LIMIT)
    : [];
  const appOrigins = Array.isArray(stored[TRUSTED_APP_ORIGINS_KEY])
    ? [...new Set(stored[TRUSTED_APP_ORIGINS_KEY].map(normalizedAppOrigin).filter(Boolean))]
    : [];

  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = oldRules
    .filter((rule) => rule.id >= FRAME_RULE_ID_BASE && rule.id < FRAME_RULE_ID_BASE + FRAME_RULE_LIMIT)
    .map((rule) => rule.id);

  const permittedSources = [];
  for (const origin of sourceOrigins) {
    const allowed = await chrome.permissions.contains({ origins: [origin + "/*"] }).catch(() => false);
    if (allowed) permittedSources.push(origin);
  }

  const initiatorDomains = [...new Set(appOrigins.map((origin) => {
    try { return new URL(origin).hostname; } catch { return null; }
  }).filter(Boolean))];

  const addRules = enabled && initiatorDomains.length
    ? permittedSources.map((origin, index) => ({
        id: FRAME_RULE_ID_BASE + index,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" },
          ],
        },
        condition: {
          requestDomains: [new URL(origin).hostname],
          initiatorDomains,
          resourceTypes: ["sub_frame"],
        },
      }))
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

// Refresh the opt-in, source-scoped header rules whenever settings change.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && [
    ENABLED_SOURCE_ORIGINS_KEY,
    TRUSTED_APP_ORIGINS_KEY,
    IGNORE_FRAME_RESTRICTIONS_KEY,
  ].some((key) => Object.hasOwn(changes, key))) {
    void refreshFrameRestrictionRules().catch(() => {});
  }
});

// Upgrade registrations after unpacked-extension reloads or extension updates,
// so existing grants pick up the player-only stylesheet without reauthorization.
chrome.runtime.onInstalled.addListener(() => {
  void refreshRegisteredSourceScripts().catch(() => {});
  void refreshFrameRestrictionRules().catch(() => {});
});

chrome.permissions.onRemoved.addListener(() => {
  void refreshRegisteredSourceScripts().catch(() => {});
  void refreshFrameRestrictionRules().catch(() => {});
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

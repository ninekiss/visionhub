const DISCOVERED_KEY = "visionHubDiscoveredOriginsByApp";
const TRUSTED_KEY = "visionHubTrustedAppOrigins";
const ENABLED_KEY = "visionHubEnabledSourceOrigins";

let activeTab = null;
let currentOrigin = null;
let discoveredOrigins = [];
let trustedOrigins = [];
let enabledOrigins = [];

function originFrom(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function appOriginFrom(value) {
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

function patternFor(origin) {
  return origin + "/*";
}

function scriptIdFor(origin) {
  return "vh-source-progress-" + origin.replace(/[^a-zA-Z0-9]/g, "-");
}

function setStatus(message, isError = false) {
  const element = document.getElementById("status");
  element.textContent = message;
  element.style.color = isError ? "#ff9696" : "#c7f36b";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number" || typeof tab.url !== "string") {
    throw new Error("无法读取当前浏览器标签页。");
  }
  activeTab = tab;
  currentOrigin = appOriginFrom(tab.url);
  document.getElementById("current-origin").textContent = currentOrigin ?? "当前页面不是 HTTPS 站点";
  document.getElementById("trust-site").disabled = !currentOrigin;

  const stored = await chrome.storage.local.get([TRUSTED_KEY, ENABLED_KEY, DISCOVERED_KEY]);
  trustedOrigins = Array.isArray(stored[TRUSTED_KEY]) ? stored[TRUSTED_KEY] : [];
  enabledOrigins = Array.isArray(stored[ENABLED_KEY]) ? stored[ENABLED_KEY] : [];
  const state = document.getElementById("trust-state");
  state.textContent = currentOrigin && trustedOrigins.includes(currentOrigin) ? "已信任" : "尚未信任";

  const byApp = stored[DISCOVERED_KEY] && typeof stored[DISCOVERED_KEY] === "object"
    ? stored[DISCOVERED_KEY]
    : {};
  const fromStorage = currentOrigin && Array.isArray(byApp[currentOrigin]) ? byApp[currentOrigin] : [];
  await scanFrameOrigins(fromStorage);
}

async function scanFrameOrigins(fromStorage = []) {
  const found = new Set();
  const add = (value) => {
    const origin = originFrom(value);
    if (origin && origin !== currentOrigin) found.add(origin);
  };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => Array.from(document.querySelectorAll("iframe"))
        .map((frame) => frame.getAttribute("src") || frame.src)
        .filter(Boolean),
    });
    for (const result of results ?? []) {
      for (const url of Array.isArray(result.result) ? result.result : []) add(url);
    }
  } catch {
    // Some browser-internal pages do not allow activeTab script execution.
  }

  for (const origin of fromStorage) add(origin);
  for (const origin of enabledOrigins) add(origin);
  discoveredOrigins = [...found].sort((a, b) => a.localeCompare(b));
  renderOrigins();
}

function renderOrigins() {
  const list = document.getElementById("domain-list");
  list.replaceChildren();
  if (discoveredOrigins.length === 0) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "未发现 HTTPS iframe。请在 VisionHub Web 的播放页打开此扩展。";
    list.append(empty);
    return;
  }

  for (const origin of discoveredOrigins) {
    const label = document.createElement("label");
    label.className = "domain";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = origin;
    checkbox.checked = enabledOrigins.includes(origin);
    const name = document.createElement("span");
    name.textContent = origin + (enabledOrigins.includes(origin) ? "（已启用）" : "");
    label.append(checkbox, name);
    list.append(label);
  }
}

document.getElementById("trust-site").addEventListener("click", async () => {
  if (!currentOrigin) return;
  trustedOrigins = [...new Set([...trustedOrigins, currentOrigin])];
  await chrome.storage.local.set({ [TRUSTED_KEY]: trustedOrigins });
  document.getElementById("trust-state").textContent = "已信任";
  setStatus("已信任 " + currentOrigin + "。只有该站点能初始化进度同步。");
});

document.getElementById("enable-domains").addEventListener("click", async () => {
  const chosen = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => input.value)
    .filter((origin) => discoveredOrigins.includes(origin));
  if (chosen.length === 0) {
    setStatus("请至少选择一个源站域名。", true);
    return;
  }

  const patterns = chosen.map(patternFor);
  try {
    const granted = await chrome.permissions.request({ origins: patterns });
    if (!granted) {
      setStatus("浏览器未授予源站访问权限，扩展不会读取这些域名。", true);
      return;
    }

    const existing = await chrome.scripting.getRegisteredContentScripts();
    const ids = chosen.map(scriptIdFor);
    const oldIds = existing.filter((script) => ids.includes(script.id)).map((script) => script.id);
    if (oldIds.length) await chrome.scripting.unregisterContentScripts({ ids: oldIds });

    await chrome.scripting.registerContentScripts(chosen.map((origin) => ({
      id: scriptIdFor(origin),
      matches: [patternFor(origin)],
      css: ["player-only.css"],
      js: ["content.js"],
      allFrames: true,
      runAt: "document_idle",
      persistAcrossSessions: true,
    })));

    enabledOrigins = [...new Set([...enabledOrigins, ...chosen])];
    await chrome.storage.local.set({ [ENABLED_KEY]: enabledOrigins });
    renderOrigins();
    setStatus("已启用 " + chosen.length + " 个域名。请刷新 Web 播放页以注入扩展。");
  } catch (error) {
    setStatus("启用失败：" + (error instanceof Error ? error.message : String(error)), true);
  }
});

document.getElementById("refresh-scan").addEventListener("click", async () => {
  setStatus("正在重新扫描…");
  try {
    const stored = await chrome.storage.local.get(DISCOVERED_KEY);
    const byApp = stored[DISCOVERED_KEY] && typeof stored[DISCOVERED_KEY] === "object"
      ? stored[DISCOVERED_KEY]
      : {};
    await scanFrameOrigins(currentOrigin && Array.isArray(byApp[currentOrigin]) ? byApp[currentOrigin] : []);
    setStatus("扫描完成。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

getActiveTab().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));

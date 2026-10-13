const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, screen, shell } = require("electron");
const { existsSync } = require("node:fs");
const path = require("node:path");
const {
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
} = require("./security.cjs");
const { createPackagedRendererHandler } = require("./renderer-protocol.cjs");
const {
  createPlayerIsolationScript,
  providerOriginAllowed,
  resolveProviderUrl,
} = require("./external-player.cjs");
const { createApplicationMenuTemplate } = require("./application-menu.cjs");
const {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeWindowState,
  readWindowState,
  writeWindowState,
} = require("./window-state.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "visionhub",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const configuredDevelopmentUrl = process.env.VITE_DEV_SERVER_URL || null;
if (configuredDevelopmentUrl && !parseDevelopmentServerUrl(configuredDevelopmentUrl)) {
  throw new Error("VITE_DEV_SERVER_URL must be a loopback HTTP URL for the local Vite renderer.");
}

const developmentUrl = configuredDevelopmentUrl
  ? new URL(configuredDevelopmentUrl).href
  : null;
const rendererPath = path.resolve(__dirname, "../renderer-dist/index.html");
const packagedRendererUrl = "visionhub://app/index.html";
let mainWindow = null;
let windowStateSaveTimer = null;
let externalPlayerSession = null;
let playbackProviders = [];
const pendingExternalWebviewSessions = [];

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function restoreWindowState() {
  return readWindowState(getWindowStatePath(), screen.getAllDisplays());
}

function saveWindowState(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.isMaximized() || window.isFullScreen()
    ? window.getNormalBounds()
    : window.getBounds();
  const state = normalizeWindowState({
    ...bounds,
    isMaximized: window.isMaximized(),
  }, screen.getAllDisplays());
  writeWindowState(getWindowStatePath(), state);
}

function attachWindowStatePersistence(window) {
  const persistImmediately = () => {
    if (windowStateSaveTimer) {
      clearTimeout(windowStateSaveTimer);
      windowStateSaveTimer = null;
    }
    try {
      saveWindowState(window);
    } catch (error) {
      console.warn("Unable to save VisionHub window state:", error);
    }
  };
  const schedulePersist = () => {
    if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer);
    windowStateSaveTimer = setTimeout(persistImmediately, 250);
  };

  window.on("move", schedulePersist);
  window.on("resize", schedulePersist);
  window.on("maximize", schedulePersist);
  window.on("unmaximize", schedulePersist);
  window.on("minimize", schedulePersist);
  window.on("close", persistImmediately);
  window.on("closed", () => {
    if (windowStateSaveTimer) {
      clearTimeout(windowStateSaveTimer);
      windowStateSaveTimer = null;
    }
  });
}

function isTrustedAppUrl(url) {
  return isTrustedRendererUrl(url, {
    developmentUrl,
    packagedUrl: packagedRendererUrl,
  });
}

function isTrustedRendererEvent(event) {
  const senderFrame = event && event.senderFrame;
  return Boolean(
    senderFrame &&
    !senderFrame.parent &&
    isTrustedAppUrl(senderFrame.url)
  );
}

function sendExternalPlayerStatus(status, providerId, requestId, code) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("external-player:status", {
    status,
    providerId,
    requestId,
    ...(code ? { code } : {}),
  });
}

function clearExternalPlayerTimers(session) {
  if (!session) return;
  if (session.readinessInterval) clearInterval(session.readinessInterval);
  if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
  session.readinessInterval = null;
  session.timeoutHandle = null;
}

function closeExternalPlayer(options = {}) {
  const session = externalPlayerSession;
  if (!session || (options.requestId && options.requestId !== session.requestId)) return false;
  clearExternalPlayerTimers(session);
  externalPlayerSession = null;
  try {
    if (session.webContents && !session.webContents.isDestroyed()) session.webContents.stop();
  } catch {
    // The guest may already have been detached by React.
  }
  if (options.notify) sendExternalPlayerStatus(options.status || "error", session.providerId, session.requestId, options.code);
  return true;
}

function failExternalPlayer(session, code) {
  if (!session || externalPlayerSession !== session) return;
  closeExternalPlayer({ notify: true, status: "error", code });
}

function startExternalPlayerReadinessCheck(session) {
  if (externalPlayerSession !== session || !session.webContents || session.readinessInterval) return;
  let running = false;
  const check = async () => {
    if (running || externalPlayerSession !== session || !session.webContents || session.webContents.isDestroyed()) return;
    running = true;
    try {
      const script = createPlayerIsolationScript(
        session.provider.playerSelector,
        session.provider.readinessSelector || session.provider.playerSelector,
      );
      const ready = await session.webContents.executeJavaScript(script, false);
      if (ready && externalPlayerSession === session) {
        clearExternalPlayerTimers(session);
        sendExternalPlayerStatus("ready", session.providerId, session.requestId);
      }
    } catch {
      // Keep checking until the provider's bounded readiness timeout.
    } finally {
      running = false;
    }
  };
  session.readinessInterval = setInterval(() => { void check(); }, 250);
  void check();
}

function attachExternalPlayerWebContents(session, webContents) {
  if (externalPlayerSession !== session || session.webContents) {
    try { webContents.stop(); } catch {}
    return;
  }
  session.webContents = webContents;

  const rejectNavigation = (event, targetOrDetails, _isInPlace, deprecatedIsMainFrame) => {
    const details = targetOrDetails && typeof targetOrDetails === "object"
      ? targetOrDetails
      : { url: targetOrDetails, isMainFrame: deprecatedIsMainFrame };
    const targetUrl = details.url;
    const isMainFrame = details.isMainFrame ?? deprecatedIsMainFrame;
    if (typeof targetUrl === "string" && providerOriginAllowed(targetUrl, session.provider)) return;
    event.preventDefault();
    if (isMainFrame !== false) failExternalPlayer(session, "navigation-blocked");
  };

  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", rejectNavigation);
  webContents.on("will-frame-navigate", rejectNavigation);
  webContents.on("will-redirect", rejectNavigation);
  webContents.on("did-fail-load", (_event, errorCode, _description, _validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) failExternalPlayer(session, "load-failed");
  });
  webContents.on("did-finish-load", () => startExternalPlayerReadinessCheck(session));
  webContents.on("render-process-gone", () => failExternalPlayer(session, "renderer-crashed"));
  webContents.on("destroyed", () => {
    clearExternalPlayerTimers(session);
    if (externalPlayerSession === session) externalPlayerSession = null;
  });

  try {
    webContents.session.setPermissionRequestHandler((_requestingContents, _permission, callback) => callback(false));
    webContents.session.setPermissionCheckHandler(() => false);
  } catch {
    // Session may already be shutting down.
  }
}

function attachExternalPlayerWebviewGuards(window) {
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    const active = externalPlayerSession;
    const sourceUrl = params && typeof params.src === "string" ? params.src : "";
    if (!active || active.webContents || sourceUrl !== active.url ||
        !providerOriginAllowed(sourceUrl, active.provider)) {
      event.preventDefault();
      return;
    }

    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.plugins = false;
    webPreferences.webviewTag = false;
    delete webPreferences.preload;
    params.preload = "";
    params.allowpopups = false;
    params.partition = "persist:visionhub-source-" + active.providerId;
    pendingExternalWebviewSessions.push(active);
  });

  window.webContents.on("did-attach-webview", (_event, guestWebContents) => {
    const session = pendingExternalWebviewSessions.shift();
    if (!session || session !== externalPlayerSession) {
      try { guestWebContents.stop(); } catch {}
      return;
    }
    const actualUrl = guestWebContents.getURL();
    if (actualUrl && actualUrl !== session.url && !providerOriginAllowed(actualUrl, session.provider)) {
      try { guestWebContents.stop(); } catch {}
      failExternalPlayer(session, "navigation-blocked");
      return;
    }
    attachExternalPlayerWebContents(session, guestWebContents);
  });
}

function openExternalPlayer(providerId, contentId, requestId) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("VisionHub 播放窗口不可用。");
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9:._-]{8,160}$/.test(requestId)) {
    throw new Error("外部播放请求 ID 无效。");
  }
  const provider = playbackProviders.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("这个源站尚未配置，请检查 configs/playback-sources.yaml。");
  const url = resolveProviderUrl(provider, contentId);

  closeExternalPlayer();
  const session = {
    provider,
    providerId,
    contentId,
    requestId,
    url,
    webContents: null,
    readinessInterval: null,
    timeoutHandle: null,
  };
  externalPlayerSession = session;
  sendExternalPlayerStatus("loading", providerId, requestId);
  session.timeoutHandle = setTimeout(() => failExternalPlayer(session, "player-not-ready"), provider.timeoutMs);
  return url;
}

async function loadExternalPlaybackProviders() {
  const workspaceRoot = path.resolve(__dirname, "../../..");
  const { loadEnvironmentFiles, loadPlaybackSourcesConfig } = await import("@visionhub/config");
  if (app.isPackaged) {
    if (!process.env.PLAYBACK_SOURCES_CONFIG_PATH) {
      process.env.PLAYBACK_SOURCES_CONFIG_PATH = path.join(process.resourcesPath, "configs", "playback-sources.yaml");
    }
  } else {
    loadEnvironmentFiles({
      cwd: workspaceRoot,
      envPaths: [path.join(workspaceRoot, ".env")],
    });
  }
  const configRoot = app.isPackaged ? process.resourcesPath : workspaceRoot;
  const configDirectory = process.env.APP_CONFIG_DIR && process.env.APP_CONFIG_DIR.trim()
    ? path.resolve(configRoot, process.env.APP_CONFIG_DIR)
    : path.join(configRoot, "configs");
  const config = await loadPlaybackSourcesConfig({
    cwd: configRoot,
    configDir: configDirectory,
  });
  return config.playback.providers;
}

async function loadDesktopApiBaseUrl() {
  const workspaceRoot = path.resolve(__dirname, "../../..");
  const { loadDesktopConfig, loadEnvironmentFiles } = await import("@visionhub/config");

  if (app.isPackaged) {
    if (!process.env.DESKTOP_CONFIG_PATH) {
      process.env.DESKTOP_CONFIG_PATH = path.join(process.resourcesPath, "configs", "desktop.yaml");
    }
  } else {
    loadEnvironmentFiles({
      cwd: workspaceRoot,
      envPaths: [path.join(workspaceRoot, ".env")],
    });
  }

  const configRoot = app.isPackaged ? process.resourcesPath : workspaceRoot;
  const configDirectory = process.env.APP_CONFIG_DIR && process.env.APP_CONFIG_DIR.trim()
    ? path.resolve(configRoot, process.env.APP_CONFIG_DIR)
    : path.join(configRoot, "configs");
  const config = await loadDesktopConfig({
    cwd: configRoot,
    configDir: configDirectory,
  });
  return config.desktop.apiBaseUrl;
}

function installPackagedRendererProtocol(apiBaseUrl) {
  protocol.handle("visionhub", createPackagedRendererHandler({
    rendererRoot: path.dirname(rendererPath),
    apiBaseUrl,
  }));
}

function createWindow() {
  if (!developmentUrl && !existsSync(rendererPath)) {
    dialog.showErrorBox(
      "VisionHub Web build not found",
      "Build the Web renderer first with: pnpm --filter @visionhub/web build",
    );
    app.quit();
    return null;
  }

  const restoredState = restoreWindowState();
  const { isMaximized, ...restoredBounds } = restoredState;
  const window = new BrowserWindow({
    title: "VisionHub",
    ...restoredBounds,
    minWidth: Math.min(MIN_WINDOW_WIDTH, restoredState.width),
    minHeight: Math.min(MIN_WINDOW_HEIGHT, restoredState.height),
    backgroundColor: "#090b10",
    webPreferences: createWebPreferences(path.join(__dirname, "preload.cjs")),
  });

  if (isMaximized) window.maximize();
  attachWindowStatePersistence(window);

  window.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = getSafeExternalUrl(url);
    if (externalUrl) {
      void shell.openExternal(externalUrl).catch((error) => {
        console.error("Unable to open external HTTPS link:", error);
      });
    }
    return { action: "deny" };
  });

  const blockUntrustedNavigation = (event, url) => {
    if (!isTrustedAppUrl(url)) event.preventDefault();
  };
  window.webContents.on("will-navigate", blockUntrustedNavigation);
  window.webContents.on("will-redirect", blockUntrustedNavigation);
  attachExternalPlayerWebviewGuards(window);

  const loading = developmentUrl
    ? window.loadURL(developmentUrl)
    : window.loadURL(packagedRendererUrl);
  void loading.catch((error) => {
    console.error("Unable to load the VisionHub renderer:", error);
    dialog.showErrorBox(
      "VisionHub could not start",
      "The renderer could not be loaded. Check the Web build or the local Vite development server.",
    );
    window.close();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      closeExternalPlayer();
      mainWindow = null;
    }
  });
  mainWindow = window;
  return window;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(process.platform)));

  try {
    playbackProviders = await loadExternalPlaybackProviders();
  } catch (error) {
    playbackProviders = [];
    const message = error instanceof Error ? error.message : "检查 configs/playback-sources.yaml。";
    console.error("VisionHub external playback source config is invalid:", message);
    dialog.showErrorBox("外部播放源配置无效", message + "\\n\\n应用仍会启动，但外部源站播放已禁用。");
  }

  if (!developmentUrl) {
    let apiBaseUrl;
    try {
      apiBaseUrl = await loadDesktopApiBaseUrl();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Check configs/desktop.yaml or set DESKTOP_API_BASE_URL.";
      dialog.showErrorBox(
        "VisionHub desktop API configuration is invalid",
        message + "\n\nThe desktop app will not silently use a fallback API endpoint.",
      );
      app.quit();
      return;
    }
    installPackagedRendererProtocol(apiBaseUrl);
  }

  ipcMain.handle("desktop:get-app-info", (event) => {
    if (!isTrustedRendererEvent(event)) {
      throw new Error("Rejected IPC request from an untrusted renderer.");
    }
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      releaseChannel: app.isPackaged ? "packaged" : "development",
    };
  });

  ipcMain.handle("external-player:open", async (event, request) => {
    if (!isTrustedRendererEvent(event)) throw new Error("Rejected external-player request from an untrusted renderer.");
    if (!request || typeof request.providerId !== "string" || typeof request.contentId !== "string" ||
        typeof request.requestId !== "string") {
      throw new Error("外部播放源参数无效。");
    }
    return { url: openExternalPlayer(request.providerId, request.contentId, request.requestId) };
  });

  ipcMain.handle("external-player:close", (event, request) => {
    if (!isTrustedRendererEvent(event)) throw new Error("Rejected external-player close from an untrusted renderer.");
    if (!request || typeof request.requestId !== "string") throw new Error("外部播放关闭请求无效。");
    return closeExternalPlayer({ requestId: request.requestId });
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error("VisionHub Electron startup failed:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  closeExternalPlayer();
  if (process.platform !== "darwin") app.quit();
});

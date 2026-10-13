const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require("electron");
const { existsSync } = require("node:fs");
const path = require("node:path");
const {
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
} = require("./security.cjs");
const { createPackagedRendererHandler } = require("./renderer-protocol.cjs");

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

function isTrustedAppUrl(url) {
  return isTrustedRendererUrl(url, {
    developmentUrl,
    packagedUrl: packagedRendererUrl,
  });
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

  const window = new BrowserWindow({
    title: "VisionHub",
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#090b10",
    webPreferences: createWebPreferences(path.join(__dirname, "preload.cjs")),
  });

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
    if (mainWindow === window) mainWindow = null;
  });
  mainWindow = window;
  return window;
}

app.whenReady().then(async () => {
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
    const senderUrl = event.senderFrame && event.senderFrame.url;
    if (!senderUrl || !isTrustedAppUrl(senderUrl)) {
      throw new Error("Rejected IPC request from an untrusted renderer.");
    }
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      releaseChannel: app.isPackaged ? "packaged" : "development",
    };
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
  if (process.platform !== "darwin") app.quit();
});

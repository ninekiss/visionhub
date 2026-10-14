const { contextBridge, ipcRenderer } = require("electron");

function subscribeExternalPlayerStatus(listener) {
  if (typeof listener !== "function") throw new TypeError("A status listener is required.");
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on("external-player:status", handler);
  return () => ipcRenderer.removeListener("external-player:status", handler);
}

// Expose narrow, typed app capabilities only. The remote source WebContentsView has no preload.
contextBridge.exposeInMainWorld("visionHubDesktop", Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  openExternalPlayer: (request) => ipcRenderer.invoke("external-player:open", request),
  resizeExternalPlayer: (request) => ipcRenderer.invoke("external-player:resize", request),
  closeExternalPlayer: (request) => ipcRenderer.invoke("external-player:close", request),
  onExternalPlayerStatus: (listener) => subscribeExternalPlayerStatus(listener),
}));

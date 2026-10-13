const { contextBridge, ipcRenderer } = require("electron");

// Expose one narrow capability; never expose ipcRenderer itself.
contextBridge.exposeInMainWorld("visionHubDesktop", Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
}));

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("omniDesktop", {
  hide: () => ipcRenderer.send("omni:hide"),
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("omniDesktop", {
  hide: () => ipcRenderer.send("omni:hide"),
  show: () => ipcRenderer.send("omni:show"),
  resize: (w, h) => ipcRenderer.send("omni:size", { w, h }),
  onListen: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("omni:listen", handler);
    return () => ipcRenderer.removeListener("omni:listen", handler);
  },
});

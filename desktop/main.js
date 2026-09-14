const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || "3000";
const START_URL = process.env.ELECTRON_START_URL || `http://127.0.0.1:${PORT}`;
const HOTKEY = process.env.OMNI_HOTKEY || "Command+Shift+Space";

let win = null;
let nextProc = null;

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get(START_URL, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnNext() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = require("fs").existsSync(path.join(__dirname, "..", ".next"))
    ? "start"
    : "dev";
  nextProc = spawn(npmCmd, ["run", script], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await serverUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Omni server did not start at ${START_URL}`);
}

function positionWindow() {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [ww, wh] = win.getSize();
  win.setPosition(
    Math.round(workArea.x + (workArea.width - ww) / 2),
    Math.round(workArea.y + workArea.height * 0.2)
  );
}

function createWindow() {
  win = new BrowserWindow({
    width: 680,
    height: 360,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#ffffff",
    hasShadow: true,
    type: process.platform === "darwin" ? "panel" : "normal",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(START_URL);
  win.on("blur", () => {
    if (win && !win.webContents.isDevToolsOpened()) win.hide();
  });
}

function toggle() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }
  positionWindow();
  win.show();
  win.focus();
}

ipcMain.on("omni:hide", () => {
  win?.hide();
});

app.whenReady().then(async () => {
  if (!(await serverUp())) {
    spawnNext();
    await waitForServer();
  }
  createWindow();
  const ok = globalShortcut.register(HOTKEY, toggle);
  if (!ok) {
    console.warn(`Could not register hotkey ${HOTKEY}`);
  }
  toggle();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (nextProc && !nextProc.killed) nextProc.kill();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

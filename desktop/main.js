const { app, BrowserWindow, globalShortcut, ipcMain, screen, systemPreferences } = require("electron");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-background-timer-throttling");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");

const PORT = process.env.PORT || "3000";
const START_URL = process.env.ELECTRON_START_URL || `http://localhost:${PORT}`;
const HOTKEY = process.env.OMNI_HOTKEY || "Command+Shift+Space";
const SERVER_SCRIPT = process.env.OMNI_SERVER_SCRIPT || "dev";

process.on("uncaughtExceptionMonitor", (err, origin) => {
  console.error("[desktop] uncaught exception", origin, err.stack || err.message);
});
process.on("warning", (warning) => {
  console.warn("[desktop] process warning", warning.stack || warning.message);
});

let win = null;
let nextProc = null;
let open = false;
let loadedOnce = false;
let serverMonitor = null;
let lastServerState = null;
let quitting = false;

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

function portInUse() {
  return new Promise((resolve) => {
    const sock = net.connect({ port: Number(PORT), host: "localhost" }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(400, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function spawnNext() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`[server] spawning npm run ${SERVER_SCRIPT} on port ${PORT}`);
  nextProc = spawn(npmCmd, ["run", SERVER_SCRIPT], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });
  nextProc.on("spawn", () => {
    console.log(`[server] process started pid=${nextProc?.pid ?? "unknown"}`);
  });
  nextProc.on("error", (err) => {
    console.error("[server] process error", err.stack || err.message);
  });
  nextProc.on("exit", (code, signal) => {
    console.error(
      `[server] process exited code=${code ?? "null"} signal=${signal ?? "none"}`
    );
    nextProc = null;
  });
}

async function waitForServer(tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await serverUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Omni server did not start at ${START_URL}`);
}

function warmCapture() {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.request(
      `${START_URL}/api/capture`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        console.log(
          `[server] capture warm-up status=${res.statusCode ?? "unknown"} ${Date.now() - started}ms`
        );
        res.resume();
        res.on("end", resolve);
      }
    );
    req.on("error", (err) => {
      console.error("[server] capture warm-up failed", err.message);
      resolve();
    });
    req.setTimeout(8000, () => {
      console.error("[server] capture warm-up timed out");
      req.destroy();
      resolve();
    });
    req.write(JSON.stringify({ warm: true }));
    req.end();
  });
}

function startServerMonitor() {
  const check = async () => {
    const up = await portInUse();
    if (up !== lastServerState) {
      console.log(`[server] health ${up ? "up" : "down"} port=${PORT}`);
      lastServerState = up;
    }
  };
  void check();
  serverMonitor = setInterval(check, 2000);
  serverMonitor.unref();
}

function positionWindow() {
  if (!alive()) return;
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [ww, wh] = win.getSize();
  win.setPosition(
    Math.round(workArea.x + (workArea.width - ww) / 2),
    Math.round(workArea.y + workArea.height * 0.2)
  );
}

function alive() {
  return Boolean(win && !win.isDestroyed());
}

function createWindow() {
  if (alive()) return;
  win = new BrowserWindow({
    width: 720,
    height: 560,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: true,
    opacity: 0.02,
    backgroundColor: "#ffffff",
    hasShadow: true,
    type: process.platform === "darwin" ? "panel" : "normal",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  win.webContents.setBackgroundThrottling(false);
  disableRendererHmr(win.webContents.session);
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media" || permission === "microphone");
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "microphone";
  });
  win.webContents.session.setDevicePermissionHandler((details) => {
    return details.deviceType === "audio" || details.deviceType === "video";
  });

  win.webContents.on("console-message", (event) => {
    const message = event.message ?? "";
    if (/webpack-hmr|hot-update/i.test(message)) return;
    if (
      event.level >= 2 ||
      /omni|wake|listen|transcribe|scribe|mcp|n8n|capture|WebSocket/i.test(
        message
      )
    ) {
      console.log("[overlay]", message);
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[overlay] renderer gone", details.reason, details.exitCode);
  });
  win.webContents.on("will-prevent-unload", (event) => {
    console.warn(`[overlay] renderer unload requested quitting=${quitting}`);
    if (quitting) event.preventDefault();
  });
  win.webContents.on(
    "did-fail-load",
    (_event, code, description, url, isMainFrame) => {
      if (isMainFrame) {
        console.error("[overlay] load failed", code, description, url);
      }
    }
  );
  win.on("unresponsive", () => {
    console.error("[overlay] renderer unresponsive");
  });
  win.webContents.on("did-start-navigation", (event, url, isInPlace, isMainFrame) => {
    const target = url || event.url;
    const main = event.isMainFrame ?? isMainFrame;
    const sameDocument = event.isSameDocument ?? isInPlace;
    if (loadedOnce && main && !sameDocument) {
      console.warn("[overlay] navigation started", target);
    }
  });
  conceal();
  win.loadURL(START_URL);
  win.on("close", (event) => {
    console.warn(`[overlay] close requested quitting=${quitting}`);
    if (quitting) return;
    event.preventDefault();
    setImmediate(() => {
      if (alive()) reveal();
    });
  });
  win.on("closed", () => {
    console.warn("[overlay] window closed");
    win = null;
    open = false;
    loadedOnce = false;
  });
  win.webContents.on("will-navigate", (event, url) => {
    blockSamePageReload(event, url || event.url);
  });
  try {
    win.webContents.on("will-frame-navigate", (event) => {
      if (event.isMainFrame) blockSamePageReload(event, event.url);
    });
  } catch {
    /* older Electron */
  }
  win.webContents.on("did-finish-load", () => {
    console.log("[overlay] document loaded", win?.webContents.getURL());
    loadedOnce = true;
    if (open) reveal();
  });
}

function disableRendererHmr(session) {
  if (SERVER_SCRIPT !== "dev") return;
  const start = new URL(START_URL);
  const origin = start.origin;
  const socketOrigin = `${start.protocol === "https:" ? "wss:" : "ws:"}//${start.host}`;
  let logged = false;
  session.webRequest.onBeforeRequest(
    {
      urls: [
        `${origin}/_next/webpack-hmr*`,
        `${socketOrigin}/_next/webpack-hmr*`,
        `${origin}/_next/static/webpack/*.hot-update.*`,
      ],
    },
    (_details, callback) => {
      if (!logged) {
        logged = true;
        console.log("[overlay] renderer HMR disabled; restart desktop for UI changes");
      }
      callback({ cancel: true });
    }
  );
}

function sameAppPage(url) {
  try {
    const next = new URL(url);
    const start = new URL(START_URL);
    return next.origin === start.origin && next.pathname === start.pathname;
  } catch {
    return false;
  }
}

function blockSamePageReload(event, url) {
  if (!loadedOnce) return;
  if (url && !sameAppPage(url)) return;
  event.preventDefault();
  console.log("[overlay] blocked page reload");
}

function conceal() {
  if (!alive()) return;
  if (win.webContents.isLoadingMainFrame()) return;
  open = false;
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setOpacity(0.02);
}

function reveal() {
  if (!alive()) createWindow();
  if (!alive()) return;
  open = true;
  positionWindow();
  win.setIgnoreMouseEvents(false);
  win.setOpacity(1);
  if (!win.isVisible()) win.show();
  win.focus();
}

function toggle() {
  if (!alive()) createWindow();
  if (!alive()) return;
  if (open) conceal();
  else reveal();
}

ipcMain.on("omni:hide", () => {
  conceal();
});

ipcMain.on("omni:show", () => {
  reveal();
});

ipcMain.on("omni:size", (_e, size) => {
  if (!alive() || !size) return;
  const w = Math.max(480, Math.round(Number(size.w) || 680));
  const h = Math.max(280, Math.round(Number(size.h) || 360));
  win.setSize(w, h);
  if (open) positionWindow();
});

app.whenReady().then(async () => {
  let up = await serverUp();
  console.log(`[server] initial health ${up ? "up" : "down"}`);
  if (!up) {
    await new Promise((r) => setTimeout(r, 400));
    up = (await serverUp()) || (await portInUse());
  }
  if (!up) spawnNext();
  await waitForServer();
  startServerMonitor();
  await warmCapture();
  if (process.platform === "darwin" && systemPreferences.askForMediaAccess) {
    await systemPreferences.askForMediaAccess("microphone");
  }
  createWindow();
  const ok = globalShortcut.register(HOTKEY, toggle);
  if (!ok) {
    console.warn(`Could not register hotkey ${HOTKEY}`);
  }
  toggle();
});

app.on("will-quit", () => {
  console.log("[desktop] will quit");
  globalShortcut.unregisterAll();
  if (serverMonitor) clearInterval(serverMonitor);
  if (nextProc && !nextProc.killed) nextProc.kill();
});

app.on("before-quit", () => {
  quitting = true;
  if (alive()) win.setClosable(true);
});

app.on("child-process-gone", (_event, details) => {
  console.error(
    "[desktop] child process gone",
    details.type,
    details.reason,
    details.exitCode
  );
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

// Desktop shell for the calendar widget.
// A borderless, transparent, draggable panel that floats over the wallpaper.
//
// This process owns the data layer (formerly main.py): it fetches the published
// iCloud ICS feed, parses it with node-ical, converts each VEVENT into the
// widget's event shape, and pushes the result into the renderer over IPC.
const { app, BrowserWindow, globalShortcut, screen, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { fetchEventsFromUrls } = require("./calendar-data");

const REFRESH_MS = 15 * 60 * 1000;                 // re-fetch the feed every 15 min

let win, settingsWin;
let onTop = false;
let ready = false;          // true once the renderer has finished loading
let pendingEvents = null;   // events that arrived before the renderer was ready

// ── Config (per-user calendar link, stored outside the app bundle) ───────────
const configPath = () => path.join(app.getPath("userData"), "config.json");
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
  catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

// ── Window ───────────────────────────────────────────────────────────────────
function widgetFile(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "widget", name)   // extraResources copy
    : path.join(__dirname, "..", "widget", name);        // dev: sibling folder
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();   // screen minus taskbar
  const w = Math.round(workArea.width * 0.3667);     // ~1/3 + 10%
  const h = Math.round(workArea.height * 0.3667);
  const margin = 24;

  win = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - margin,     // park top-right
    y: workArea.y + margin,
    frame: false,
    transparent: true,
    hasShadow: false,             // the widget draws its own shadow in CSS
    resizable: true,
    skipTaskbar: true,            // it's a widget, not an app window
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  // Stamp the saved theme into the URL so the first paint is already dark
  // (no light→dark flash); runtime changes still come live over IPC.
  const search = "overlay=1" + (loadConfig().theme === "dark" ? "&theme=dark" : "");
  win.loadFile(widgetFile("index.html"), { search });
  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  win.webContents.on("did-finish-load", () => {
    ready = true;
    if (pendingEvents) { win.webContents.send("events:update", pendingEvents); pendingEvents = null; }
    sendTheme(loadConfig().theme || "light");   // re-apply theme after any (re)load
    capHeight();   // cap max height at the fully-revealed schedule (no grey gap)
    refresh();     // pull fresh events for this (re)load
    if (!(loadConfig().urls || []).length) openSettings();   // first-run prompt
  });
}

// Max useful height = current height + however much the time grid is still
// clipped (scrollHeight − clientHeight). Recomputed on every load/reload, since
// the all-day band's height changes with the event data.
function capHeight() {
  win.webContents
    .executeJavaScript(
      `(() => { const s = document.querySelector(".cal-scroll");
        return s ? s.scrollHeight - s.clientHeight : 0; })()`
    )
    .then((clipped) => {
      if (!win || win.isDestroyed() || clipped <= 0) return;
      const [, h] = win.getSize();
      // Cap height only; leave width free (Electron treats 0 as a literal
      // 0-width max, which collapses the window, so use a large width instead).
      win.setMaximumSize(100000, h + Math.ceil(clipped));
    })
    .catch(() => {});
}

// ── Data layer: fetch → convert (see calendar-data.js) ───────────────────────
async function fetchEvents() {
  const urls = (loadConfig().urls || []);
  if (!urls.length) return { needsSetup: true };
  return { events: await fetchEventsFromUrls(urls) };
}

// ── Push to renderer ─────────────────────────────────────────────────────────
function sendEvents(events) {
  if (win && !win.isDestroyed() && ready) win.webContents.send("events:update", events);
  else pendingEvents = events;
}
function sendStatus(msg) {
  if (win && !win.isDestroyed() && ready) win.webContents.send("events:status", msg);
}
function sendTheme(theme) {
  if (win && !win.isDestroyed() && ready) win.webContents.send("theme:update", theme);
}

async function refresh() {
  try {
    const r = await fetchEvents();
    if (r.needsSetup) { sendStatus("Add your calendar link in Settings (⚙)."); return; }
    sendEvents(r.events);
    sendStatus("");
  } catch (err) {
    sendStatus("Couldn't load calendar: " + err.message);
  }
}

// ── Settings window ──────────────────────────────────────────────────────────
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 300,                  // initial guess; the page resizes us on load
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,                 // match the widget: no native title bar
    transparent: true,            // let the sheet's rounded corners show through
    hasShadow: false,             // the sheet draws its own shadow in CSS
    backgroundColor: "#00000000",
    parent: win,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "settings.html"), {
    search: loadConfig().theme === "dark" ? "theme=dark" : "",
  });
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => { settingsWin = null; });
}
function closeSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ipcMain.on("events:refresh", refresh);
  ipcMain.on("settings:open", openSettings);
  ipcMain.on("window:close", () => app.quit());
  ipcMain.handle("settings:get", () => {
    const cfg = loadConfig();
    return {
      urls: cfg.urls || [],
      openAtLogin: app.getLoginItemSettings().openAtLogin,
      theme: cfg.theme || "light",
    };
  });
  ipcMain.on("settings:save", (_e, s) => {
    const cfg = loadConfig();
    cfg.urls = (s && s.urls) || [];
    cfg.theme = (s && s.theme) === "dark" ? "dark" : "light";
    saveConfig(cfg);
    app.setLoginItemSettings({ openAtLogin: !!(s && s.openAtLogin) });
    sendTheme(cfg.theme);
    closeSettings();
    refresh();
  });
  ipcMain.on("settings:cancel", closeSettings);
  // Live theme preview from the switch — applies to the widget without saving.
  ipcMain.on("theme:preview", (_e, theme) => sendTheme(theme === "dark" ? "dark" : "light"));
  // The settings page grows the window as calendar rows are added/removed.
  ipcMain.on("settings:resize", (_e, h) => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    const { workArea } = screen.getPrimaryDisplay();
    const height = Math.min(Math.max(Math.round(h) || 0, 200), workArea.height - 40);
    const [w] = settingsWin.getSize();
    settingsWin.setContentSize(w, height);
  });

  createWindow();
  setInterval(refresh, REFRESH_MS);

  // Quit (no title bar to close from)
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
  // Bring it forward when buried under windows, or send it back
  globalShortcut.register("CommandOrControl+Shift+T", () => {
    onTop = !onTop;
    win.setAlwaysOnTop(onTop);
  });
  // Reload — refetches the feed and redraws
  globalShortcut.register("CommandOrControl+Shift+R", () => win.reload());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());

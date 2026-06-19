// Desktop shell for the calendar widget.
// A borderless, transparent, draggable panel that floats over the wallpaper.
const { app, BrowserWindow, globalShortcut, screen } = require("electron");
const path = require("path");

let win;
let onTop = false;

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
    webPreferences: { contextIsolation: true },
  });

  win.loadFile(path.join(__dirname, "..", "widget", "index.html"), { search: "overlay=1" });
  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  // Cap the max height at the point where the full 24h schedule is on screen,
  // so dragging taller can't open up empty grey space below the grid.
  win.webContents.on("did-finish-load", capHeight);
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

app.whenReady().then(() => {
  createWindow();

  // Quit (no title bar to close from)
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
  // Bring it forward when buried under windows, or send it back
  globalShortcut.register("CommandOrControl+Shift+T", () => {
    onTop = !onTop;
    win.setAlwaysOnTop(onTop);
  });
  // Reload — handy after Python regenerates events.js
  globalShortcut.register("CommandOrControl+Shift+R", () => win.reload());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());

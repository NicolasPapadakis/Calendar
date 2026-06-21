// Preload — the only bridge between the privileged main process and the
// sandboxed page. contextIsolation is on, so the page (calendar.js, settings.html)
// can only see exactly what we expose here.
const { contextBridge, ipcRenderer } = require("electron");

// Buffer the most recent events so a push that arrives before the page has
// registered its handler isn't lost (race between fetch and DOM load).
let lastEvents = null;
const eventHandlers = [];
ipcRenderer.on("events:update", (_e, events) => {
  lastEvents = events;
  eventHandlers.forEach((h) => h(events));
});

let lastStatus = "";
const statusHandlers = [];
ipcRenderer.on("events:status", (_e, msg) => {
  lastStatus = msg || "";
  statusHandlers.forEach((h) => h(lastStatus));
});

// Buffer the theme too, so a reload re-applies the saved theme even if its
// push arrived before the page re-registered its handler.
let lastTheme = null;
const themeHandlers = [];
ipcRenderer.on("theme:update", (_e, theme) => {
  lastTheme = theme;
  themeHandlers.forEach((h) => h(theme));
});

// Buffer the window's fullscreen state so the topbar button's icon stays in
// sync across reloads (render() rebuilds the button each time).
let lastFullscreen = null;
const fullscreenHandlers = [];
ipcRenderer.on("window:fullscreen", (_e, on) => {
  lastFullscreen = on;
  fullscreenHandlers.forEach((h) => h(on));
});

// Widget API
contextBridge.exposeInMainWorld("calendarBridge", {
  onEvents(cb) { eventHandlers.push(cb); if (lastEvents) cb(lastEvents); },
  onStatus(cb) { statusHandlers.push(cb); if (lastStatus) cb(lastStatus); },
  onTheme(cb) { themeHandlers.push(cb); if (lastTheme) cb(lastTheme); },
  onFullscreen(cb) { fullscreenHandlers.push(cb); if (lastFullscreen != null) cb(lastFullscreen); },
  refresh() { ipcRenderer.send("events:refresh"); },
  openSettings() { ipcRenderer.send("settings:open"); },
  toggleFullscreen() { ipcRenderer.send("window:toggle-fullscreen"); },
  closeWindow() { ipcRenderer.send("window:close"); },
});

// Settings-window API
contextBridge.exposeInMainWorld("settingsAPI", {
  get() { return ipcRenderer.invoke("settings:get"); },
  save(settings) { ipcRenderer.send("settings:save", settings); },
  cancel() { ipcRenderer.send("settings:cancel"); },
  resize(height) { ipcRenderer.send("settings:resize", height); },
  previewTheme(theme) { ipcRenderer.send("theme:preview", theme); },  // live, unsaved
});

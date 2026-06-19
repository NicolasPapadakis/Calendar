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

// Widget API
contextBridge.exposeInMainWorld("calendarBridge", {
  onEvents(cb) { eventHandlers.push(cb); if (lastEvents) cb(lastEvents); },
  onStatus(cb) { statusHandlers.push(cb); if (lastStatus) cb(lastStatus); },
  refresh() { ipcRenderer.send("events:refresh"); },
  openSettings() { ipcRenderer.send("settings:open"); },
});

// Settings-window API
contextBridge.exposeInMainWorld("settingsAPI", {
  get() { return ipcRenderer.invoke("settings:get"); },
  save(settings) { ipcRenderer.send("settings:save", settings); },
  cancel() { ipcRenderer.send("settings:cancel"); },
});

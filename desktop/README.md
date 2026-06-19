# Desktop app

A borderless, transparent Electron window that floats the calendar widget over your
wallpaper — a real interactive desktop widget (events stay clickable). It loads
`../widget/index.html?overlay=1`, so the widget code is unchanged; only the
background drops away.

This Electron app is now **self-contained**: it fetches and parses the published
iCloud feed itself (`calendar-data.js`, using `node-ical`) and pushes events into
the widget over IPC. No Python is needed at runtime — `main.py` is no longer part
of the shipping path.

## Run (development)

Requires [Node.js](https://nodejs.org) (includes npm).

```bash
cd desktop
npm install      # downloads Electron + node-ical (first run only)
npm start
```

On first launch a **Settings** window asks for your published calendar link
(see below). After saving, the widget appears top-right, sized to ~1/3 × 1/3 of
your screen, and refreshes every 15 minutes.

## Your calendar link

In Apple Calendar: right-click the calendar → **Share Calendar** → enable
**Public Calendar** → copy the link. Both `webcal://` and `https://` forms work.
Open Settings any time via the **⚙ gear** in the widget's top bar. The link is
stored per-user in `%APPDATA%/Calendar Widget/config.json` — it is **not** baked
into the app, so the same build is safe to share.

## Controls

| Action | How |
| --- | --- |
| **Move it** | Drag the "Month Year" bar at the top |
| **Click an event** | Opens its detail popover |
| **Settings** | ⚙ gear (top-right of the bar) |
| **Quit** | `Ctrl + Shift + Q` |
| **Bring to front / send back** | `Ctrl + Shift + T` (toggles always-on-top) |
| **Reload / refetch** | `Ctrl + Shift + R` |

## Build a shippable installer

```bash
npm run dist     # → dist/Calendar Widget Setup x.y.z.exe  (NSIS installer)
npm run pack     # → dist/win-unpacked/  (unpacked app, for quick local testing)
```

`extraResources` copies `../widget` into the bundle; the app loads it from
`process.resourcesPath` when packaged and from `../widget` in dev.

Notes:
- **Code signing**: the build is unsigned, so Windows SmartScreen will warn on
  first launch ("More info → Run anyway"). For wider distribution, sign it with a
  code-signing certificate.
- **Icon**: no custom icon is set yet (default Electron icon). Add
  `build.win.icon` pointing at a `.ico` to brand it.

## Honest limitation

On Windows, Electron can't glue a window *behind* the desktop icons without native
Win32 hooks. So this floats like a pinned panel (think Rainmeter): it stays where you
put it, but another window can cover it — use `Ctrl + Shift + T` to pop it back.

## Auto-start with Windows

Open Settings (⚙) and tick **"Open automatically when I log in"**. This uses
Electron's `setLoginItemSettings`, which registers the installed
`Calendar Widget.exe` under the Windows login-items registry key. Untick it to
remove the entry. (In `npm start` dev mode the toggle registers `electron.exe`
instead, so set it from an installed build.)

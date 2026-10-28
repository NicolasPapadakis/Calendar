# Calendar Widget

A translucent desktop calendar widget for Windows. A borderless, transparent
Electron window floats an Apple-style **week view** (yesterday + the next 6 days, in
7 columns) over your wallpaper. It fetches a published **iCloud / ICS feed**, parses
it, and renders clickable events that refresh every 15 minutes.

It behaves like a pinned panel (think Rainmeter): it stays where you put it and the
events stay interactive.

## Get the widget

1. **[Download it here](https://github.com/NicolasPapadakis/Calendar/releases/tag/v1.0)**.
   Under **Assets**, click the file ending in `Setup.exe`.
2. Open the downloaded file to install it. If Windows shows a blue "Windows protected
   your PC" message, click **More info**, then **Run anyway**.
3. When the widget starts, a **Settings** window asks for your calendar link. Follow
   the steps below to get one, paste it in, and click **Save**. To add more calendars,
   click **+ Add calendar**. You can open Settings again any time with the **⚙** button.

### Apple (iCloud) Calendar

1. Open the **Calendar** app on your Mac (or go to [icloud.com/calendar](https://www.icloud.com/calendar)).
2. Right-click the calendar you want in the sidebar and choose **Share Calendar**.
3. Tick **Public Calendar** and copy the link that appears.

### Google Calendar

1. Open [calendar.google.com](https://calendar.google.com) on a computer.
2. In the left sidebar, hover over the calendar you want, click the **⋮** menu, and
   choose **Settings and sharing**.
3. Scroll down to **Integrate calendar** and copy the **Secret address in iCal format**.
   Keep this link private: anyone who has it can see your calendar.

Google can take a few hours to show new events in the link, so changes may not appear
in the widget right away.

## Project layout

The app is a self-contained Node/Electron project split into two decoupled parts:

| Folder | Role |
| --- | --- |
| [`widget/`](widget) | **The view.** Pure HTML/CSS/JS — no Electron or Node. Renders the week grid from a plain array of events. Runs unchanged in a browser. |
| [`desktop/`](desktop) | **The Electron shell + data layer.** Owns the window, fetches and parses the ICS feed (`node-ical`), and pushes events into the widget over IPC. |

The two communicate through one small contract — the shell hands the widget plain
event objects via `window.Calendar.setEvents([...])`, and the widget knows nothing
about where they came from. See [`CLAUDE.md`](CLAUDE.md) for the full architecture
notes.

## Quick start (development)

Requires [Node.js](https://nodejs.org) (includes npm). No Python is needed.

```bash
cd desktop
npm install      # Electron + node-ical (first run only)
npm start        # launches the widget on your desktop
```

On first launch a **Settings** window asks for your calendar link. After you save,
the widget appears top-right, sized to roughly ⅓ × ⅓ of your screen.

### Iterate on the view alone

The `widget/` folder runs in a plain browser (no Electron) for fast CSS/layout work —
it falls back to sample data:

```bash
python -m http.server -d widget 8000   # then open http://localhost:8000
```

## Connecting your calendar

In Apple Calendar: right-click the calendar → **Share Calendar** → enable
**Public Calendar** → copy the link. Both `webcal://` and `https://` forms work.
Open Settings any time via the **⚙ gear** in the widget's top bar.

Your link is stored per-user in `%APPDATA%/Calendar Widget/config.json` — it is **not**
baked into the build, so the same installer is safe to share.

## Controls

| Action | How |
| --- | --- |
| Move it | Drag the "Month Year" bar at the top |
| Open an event | Click it for its detail popover |
| Settings | ⚙ gear (top-left of the bar) |
| Full screen | Maximize button (top-right) |
| Quit | `Ctrl + Shift + Q` |
| Keep on top / in background | Settings → **Pin to** |
| Reload / refetch | `Ctrl + Shift + R` |

## Building an installer

```bash
cd desktop
npm run dist     # → dist/Calendar Widget Setup x.y.z.exe   (NSIS installer)
npm run pack     # → dist/win-unpacked/                     (unpacked, for quick testing)
```

The app icon is `desktop/build/icon.ico`. `extraResources` copies `widget/` into the
bundle, so the shell loads it from `process.resourcesPath` when packaged and from
`../widget` in dev.

**Note:** builds are **unsigned**, so Windows SmartScreen warns on first launch
("More info → Run anyway"). Sign the build with a code-signing certificate for wider
distribution.

## Auto-start with Windows

Open Settings (⚙) and tick **"Open automatically when I log in"** (uses Electron's
`setLoginItemSettings`). Set it from an installed build — in `npm start` dev mode the
toggle registers `electron.exe` instead of the installed app.

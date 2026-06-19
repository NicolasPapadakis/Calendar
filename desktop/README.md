# Desktop shell

A borderless, transparent Electron window that floats the calendar widget over your
wallpaper — a real interactive desktop widget (events stay clickable). It loads
`../widget/index.html?overlay=1`, so the widget code is unchanged; only the
background drops away.

## Run

Requires [Node.js](https://nodejs.org) (includes npm).

```bash
cd desktop
npm install      # downloads Electron (first run only, ~one-time)
npm start
```

The widget appears top-right, sized to ~1/3 × 1/3 of your screen.

## Controls

| Action | How |
| --- | --- |
| **Move it** | Drag the "Month Year" bar at the top |
| **Click an event** | Opens its detail popover |
| **Quit** | `Ctrl + Shift + Q` |
| **Bring to front / send back** | `Ctrl + Shift + T` (toggles always-on-top) |
| **Reload** | `Ctrl + Shift + R` (after Python rewrites `events.js`) |

## Honest limitation

On Windows, Electron can't glue a window *behind* the desktop icons without native
Win32 hooks. So this floats like a pinned panel (think Rainmeter): it stays where you
put it, but another window can cover it — use `Ctrl + Shift + T` to pop it back.

If you'd rather it live truly on the wallpaper layer (behind icons), that's **Path A**
— point [Lively Wallpaper](https://github.com/rocksdanister/lively) or Wallpaper
Engine at `../widget/index.html`. The trade is that clicking events becomes
unreliable there.

## Auto-start with Windows (optional)

Create a shortcut that runs `npm start` in this folder (or package with
`electron-builder` later) and drop it in your Startup folder
(`Win + R` → `shell:startup`).

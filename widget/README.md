# Calendar Widget

A translucent desktop widget that renders your iCloud calendar as an Apple-style
**week view** (yesterday + 6 days, 7 columns), sized to roughly 1/3 × 1/3 of the
screen. Built in HTML/CSS/JS — **not** in `main.py`. The Python side stays the data
layer; the widget is the view. They meet through one small contract.

## Why web, not Python

The data is parsed in Python, but the *view* needs SF Pro fonts, vibrancy/blur,
rounded translucency, and a live red time indicator — things a Python GUI toolkit
can't reproduce convincingly, and SwiftUI can't run on Windows. Web gives pixel
control with zero coupling to `main.py`.

> Font note: the target face is **SF Pro** (`-apple-system`). On Windows that font
> isn't installed, so the widget falls back to **Inter** (the closest SF substitute).
> On a Mac/iPhone it renders in real SF and is pixel-identical.

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server -d widget 8000   # then visit http://localhost:8000
```

## Feeding it data (the contract)

The widget exposes a tiny global API. **This is the only integration surface.**

```js
Calendar.setEvents([ ...events ]);  // replace all events, re-render
Calendar.createEvent({ ... });      // add a single event, re-render
Calendar.clearEvents();
Calendar.refresh();
```

You have two ways to push your parsed events in:

1. **Regenerate `events.js`** — have Python overwrite this file with a script that
   calls `Calendar.setEvents([...])`. Works when opening `index.html` directly
   (`file://`). This is what the sample `events.js` does.

2. **Write `events.json`** — drop a JSON array next to `index.html`. When the page
   is *served over http* the widget fetches it automatically and it takes
   precedence. (Browsers block `fetch` on `file://`, so use this only when serving.)

### Event shape

Lowercase keys are preferred; the README's capitalized keys (`Name`, `Start`, …)
are also accepted, so your existing parser output can flow straight in.

```jsonc
{
  "title":       "Chem",                       // or "Name"
  "start":       "2026-06-23T17:15:00",        // ISO; a date-only "2026-06-23" ⇒ all-day
  "end":         "2026-06-23T18:45:00",
  "description": "Bring lab notebook",          // HTML is allowed; shown as plain text
  "location":    "Room 4",                      // optional
  "calendar":    "School",                      // optional, shown in the popover
  "color":       "#007aff",                     // calendar tint (use X-APPLE-CALENDAR-COLOR)
  "allDay":      false,                          // optional; inferred for date-only starts
  "repeat": {                                    // optional
    "frequency": "WEEKLY",                       // WEEKLY | DAILY
    "byDay":     ["TU", "TH"],                   // SU MO TU WE TH FR SA
    "until":     "2026-07-23"
  }
}
```

Recurring events are expanded **only within the visible week**, so you can hand the
widget raw `RRULE`-derived repeat rules without pre-expanding them. Supported:
`WEEKLY` (with or without `byDay`) and `DAILY`, honoring `until`.

### Mapping from the ICS feed

`main.py` downloads the feed; a parser turns each `VEVENT` into the shape above:

| ICS field                         | Event key      |
| --------------------------------- | -------------- |
| `SUMMARY`                         | `title`        |
| `DTSTART` / `DTEND`               | `start` / `end`|
| `DTSTART;VALUE=DATE`              | ⇒ `allDay`     |
| `DESCRIPTION`                     | `description`  |
| `LOCATION`                        | `location`     |
| `X-WR-CALNAME`                    | `calendar`     |
| `X-APPLE-CALENDAR-COLOR`          | `color`        |
| `RRULE` (`FREQ`/`BYDAY`/`UNTIL`)  | `repeat`       |

## Pinning to the desktop background (Windows)

The widget is a normal web page. To make it *live on the wallpaper*, host it in a
borderless, always-on-bottom shell — e.g. a small **WebView2/Tauri/Electron** window
positioned top-right and excluded from Alt-Tab, or a wallpaper engine that renders a
URL. The widget code doesn't change; only the shell does.

## Files

| File           | Role                                                        |
| -------------- | ----------------------------------------------------------- |
| `index.html`   | Widget shell + the demo desktop backdrop                    |
| `calendar.js`  | Rendering engine + public API (`window.Calendar`)           |
| `calendar.css` | Apple Calendar styling (vibrancy, SF/Inter, red now-line)   |
| `events.js`    | **Sample data — replace/regenerate this from Python**       |

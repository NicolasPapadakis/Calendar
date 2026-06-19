/* ───────────────────────────────────────────────────────────────────────────
   Calendar widget — rendering engine + public API.

   Data contract (decoupled from main.py):
     The Python side parses the iCloud feed and feeds events in here through:

        Calendar.setEvents([ ...events ])   // replace all
        Calendar.createEvent({ ... })        // add one
        Calendar.clearEvents()
        Calendar.refresh()

   Event shape (lowercase preferred; README's Capitalized keys also accepted):
     {
       title       | Name        : "Chem"
       start       | Start        : "2026-06-23T17:15:00"  (ISO; date-only ⇒ all-day)
       end         | End          : "2026-06-23T18:45:00"
       description | Description  : "..."          (HTML allowed; rendered as text)
       location    | Location     : "Room 4"       (optional)
       calendar    | Calendar     : "School"       (optional, shown in popover)
       color       | Color        : "#007AFF"      (calendar tint)
       allDay      | AllDay       : true|false     (optional; inferred for date-only)
       repeat      | Repeat       : { frequency:"WEEKLY", byDay:["TU","TH"], until:"2026-07-23" }
     }
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── Layout constants ──────────────────────────────────────────────────────
  const HOUR_H   = 28;            // px per hour row (compact — ~40% shorter)
  const GUTTER   = 46;            // px width of the hour-label gutter
  const WIN_BACK = 1;             // days shown before today (yesterday)
  const WIN_DAYS = 7;             // total columns
  const MIN_EVT_H = 14;           // minimum rendered event height
  const DEFAULT_COLOR = "#007AFF";
  const WD  = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const WDF = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYNAME = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

  // ── State ─────────────────────────────────────────────────────────────────
  let rawEvents = [];
  let root, scrollEl, nowEl, didAutoScroll = false;
  let sbEl, sbThumb, sbHideTimer;

  // ── Public API ────────────────────────────────────────────────────────────
  const Calendar = {
    setEvents(arr) { rawEvents = Array.isArray(arr) ? arr.slice() : []; render(); },
    createEvent(e) { rawEvents.push(e); render(); return e; },
    clearEvents()  { rawEvents = []; render(); },
    refresh()      { render(); },
  };
  window.Calendar = Calendar;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    root = document.getElementById("cal");
    if (!root) return;
    render();
    tryLoadJson();                                  // optional override if served
    setInterval(updateNow, 30 * 1000);              // keep the red line live
    window.addEventListener("resize", updateScrollbar);
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const addDays    = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function parseDT(v) {
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {                  // date-only ⇒ all-day
      const [y, m, d] = v.split("-").map(Number);
      return { date: new Date(y, m - 1, d), allDay: true };
    }
    const dt = new Date(v);
    return isNaN(dt) ? null : { date: dt, allDay: false };
  }

  function fmtHour(h) {
    const ap = h < 12 ? "AM" : "PM";
    let hh = h % 12; if (hh === 0) hh = 12;
    return hh + " " + ap;
  }
  function fmtTime(d) {
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12;
    return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, "0")} ${ap}`;
  }
  const fmtRange = (s, e) => `${fmtTime(s)} – ${fmtTime(e)}`;

  // ── Normalization ─────────────────────────────────────────────────────────
  const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null) return o[k]; return undefined; };

  function normalize(raw) {
    const s = parseDT(pick(raw, "start", "Start"));
    if (!s) return null;
    const e = parseDT(pick(raw, "end", "End")) || { date: new Date(s.date.getTime() + 3600000), allDay: s.allDay };
    const rep = pick(raw, "repeat", "Repeat");
    let repeat = null;
    if (rep) {
      let byDay = pick(rep, "byDay", "ByDay") || [];
      if (typeof byDay === "string") byDay = byDay.split(",").map((x) => x.trim());
      repeat = {
        freq: String(pick(rep, "frequency", "Frequency") || "").toUpperCase(),
        byDay: byDay.map((x) => x.toUpperCase()),
        until: (parseDT(pick(rep, "until", "Until")) || {}).date || null,
      };
    }
    return {
      title: pick(raw, "title", "Name") || "(no title)",
      description: pick(raw, "description", "Description") || "",
      location: pick(raw, "location", "Location") || "",
      calendar: pick(raw, "calendar", "Calendar") || "",
      color: pick(raw, "color", "Color") || DEFAULT_COLOR,
      allDay: pick(raw, "allDay", "AllDay") ?? s.allDay,
      start: s.date,
      end: e.date,
      repeat,
    };
  }

  // ── Recurrence expansion (within the visible window only) ──────────────────
  function expand(ev, winStart, winEnd) {
    const within = (a, b) => b > winStart && a < winEnd;
    if (!ev.repeat || !ev.repeat.freq)
      return within(ev.start, ev.end) ? [ev] : [];

    const dur = ev.end - ev.start;
    const until = ev.repeat.until ? endOfDay(ev.repeat.until) : winEnd;
    const out = [];
    for (let d = new Date(winStart); d < winEnd; d = addDays(d, 1)) {
      if (d < startOfDay(ev.start)) continue;
      if (d > until) break;
      let match = false;
      if (ev.repeat.freq === "DAILY") match = true;
      else if (ev.repeat.freq === "WEEKLY")
        match = ev.repeat.byDay.length ? ev.repeat.byDay.includes(WD[d.getDay()])
                                       : d.getDay() === ev.start.getDay();
      if (!match) continue;
      const s = new Date(d); s.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
      out.push({ ...ev, start: s, end: new Date(s.getTime() + dur) });
    }
    return out;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!root) return;
    const now = new Date();
    const winStart = addDays(startOfDay(now), -WIN_BACK);
    const winEnd = addDays(winStart, WIN_DAYS);
    const days = Array.from({ length: WIN_DAYS }, (_, i) => addDays(winStart, i));

    const instances = rawEvents.map(normalize).filter(Boolean)
      .flatMap((ev) => expand(ev, winStart, winEnd));
    const allDay = instances.filter((e) => e.allDay);
    const timed  = instances.filter((e) => !e.allDay);

    const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(now);

    root.innerHTML = `
      <div class="cal-topbar"><span class="cal-month">${monthLabel}</span></div>
      <div class="cal-headrow">
        <div class="cal-spacer"></div>
        ${days.map((d) => dayHead(d, now)).join("")}
      </div>
      ${allDay.length ? alldayBand(days, allDay) : ""}
      <div class="cal-scroll">
        <div class="cal-body" style="height:${HOUR_H * 24}px">
          <div class="cal-times">
            ${Array.from({ length: 24 }, (_, h) =>
              `<div class="cal-time${h === 0 ? " is-first" : ""}" style="top:${h === 0 ? 2 : h * HOUR_H}px">${fmtHour(h)}</div>`).join("")}
          </div>
          <div class="cal-canvas">
            ${Array.from({ length: 24 }, (_, h) =>
              `<div class="cal-hline" style="top:${h * HOUR_H}px"></div>`).join("")}
            ${days.map((d, i) => dayColumn(d, timed, i === WIN_DAYS - 1)).join("")}
            <div class="cal-now" id="cal-now"><span class="cal-now-dot"></span></div>
          </div>
        </div>
      </div>
      <div class="cal-sb"><div class="cal-sb-thumb"></div></div>`;

    // wire event clicks
    root.querySelectorAll(".cal-evt").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openPopover(JSON.parse(el.dataset.evt), el);
      });
    });

    scrollEl = root.querySelector(".cal-scroll");
    nowEl = root.querySelector("#cal-now");
    updateNow();
    setupScrollbar();
    if (!didAutoScroll && scrollEl) {
      didAutoScroll = true;
      requestAnimationFrame(() => {
        scrollEl.scrollTop = Math.max(0, (now.getHours() + now.getMinutes() / 60) * HOUR_H - HOUR_H * 2.5);
        updateScrollbar();
      });
    }
  }

  // ── Custom Apple-style overlay scrollbar (the native one is hidden) ────────
  function setupScrollbar() {
    sbEl = root.querySelector(".cal-sb");
    sbThumb = root.querySelector(".cal-sb-thumb");
    if (!sbEl || !scrollEl) return;
    scrollEl.addEventListener("scroll", () => { updateScrollbar(); flashScrollbar(); }, { passive: true });
    scrollEl.addEventListener("pointerenter", flashScrollbar);
    sbThumb.addEventListener("pointerdown", startScrollDrag);
    updateScrollbar();
    flashScrollbar();
  }

  function flashScrollbar() {
    if (!sbEl) return;
    sbEl.classList.add("is-active");
    clearTimeout(sbHideTimer);
    sbHideTimer = setTimeout(() => sbEl.classList.remove("is-active"), 1100);
  }

  function updateScrollbar() {
    if (!sbEl || !scrollEl) return;
    const vh = scrollEl.clientHeight, ch = scrollEl.scrollHeight;
    sbEl.style.top = scrollEl.offsetTop + "px";
    sbEl.style.height = vh + "px";
    if (ch <= vh + 1) { sbEl.style.display = "none"; return; }
    sbEl.style.display = "block";
    const thumbH = Math.max((vh / ch) * vh, 26);
    const top = (scrollEl.scrollTop / (ch - vh)) * (vh - thumbH);
    sbThumb.style.height = thumbH + "px";
    sbThumb.style.transform = `translateY(${top}px)`;
  }

  function startScrollDrag(e) {
    e.preventDefault();
    const vh = scrollEl.clientHeight, ch = scrollEl.scrollHeight;
    const thumbH = Math.max((vh / ch) * vh, 26);
    const maxTop = vh - thumbH;
    const startY = e.clientY, startScroll = scrollEl.scrollTop;
    sbEl.classList.add("is-active", "is-dragging");
    const move = (ev) => {
      const d = ((ev.clientY - startY) / maxTop) * (ch - vh);
      scrollEl.scrollTop = startScroll + d;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      sbEl.classList.remove("is-dragging");
      flashScrollbar();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function dayHead(d, now) {
    const today = startOfDay(d).getTime() === startOfDay(now).getTime();
    return `<div class="cal-dayhead${today ? " is-today" : ""}">
      <span class="cal-dow">${WDF[d.getDay()]}</span>
      <span class="cal-dnum">${d.getDate()}</span>
    </div>`;
  }

  function alldayBand(days, items) {
    const cells = days.map((d) => {
      const ds = startOfDay(d).getTime();
      const here = items.filter((e) => {
        for (let x = startOfDay(e.start); x <= e.end; x = addDays(x, 1))
          if (x.getTime() === ds) return true;
        return false;
      });
      return `<div class="cal-allcell">${here.map((e) =>
        `<div class="cal-allpill cal-evt" style="--c:${e.color}" data-evt='${enc(e)}'>${esc(e.title)}</div>`
      ).join("")}</div>`;
    }).join("");
    return `<div class="cal-allday"><div class="cal-spacer cal-allspacer">all-day</div>${cells}</div>`;
  }

  function dayColumn(day, timed, isLast) {
    const ds = startOfDay(day), de = addDays(ds, 1);
    const here = timed
      .filter((e) => e.end > ds && e.start < de)
      .map((e) => ({ ...e, vs: Math.max(e.start, ds), ve: Math.min(e.end, de) }))
      .sort((a, b) => a.vs - b.vs || b.ve - a.ve);

    layoutLanes(here);

    const blocks = here.map((e) => {
      const top = ((e.vs - ds) / 3600000) * HOUR_H;
      const h = Math.max(((e.ve - e.vs) / 3600000) * HOUR_H, MIN_EVT_H);
      const w = 100 / e._cols, left = e._col * w;
      const compact = h < 24 ? " is-compact" : "";
      return `<div class="cal-evt cal-block${compact}" data-evt='${enc(e)}'
          style="top:${top}px;height:${h}px;left:${left}%;width:calc(${w}% - 3px);--c:${e.color}">
          <span class="cal-evt-title">${esc(e.title)}</span>
          <span class="cal-evt-time">${fmtTime(e.start)}</span>
        </div>`;
    }).join("");

    return `<div class="cal-col${isLast ? " is-last" : ""}">${blocks}</div>`;
  }

  // greedy lane packing so overlapping events sit side-by-side (Apple-style)
  function layoutLanes(list) {
    let cluster = [], clusterEnd = -Infinity;
    const flush = () => {
      if (!cluster.length) return;
      const lanes = [];
      for (const e of cluster) {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i] <= e.vs) { e._col = i; lanes[i] = e.ve; placed = true; break; }
        }
        if (!placed) { e._col = lanes.length; lanes.push(e.ve); }
      }
      cluster.forEach((e) => (e._cols = lanes.length));
      cluster = [];
    };
    for (const e of list) {
      if (e.vs >= clusterEnd) { flush(); clusterEnd = e.ve; }
      else clusterEnd = Math.max(clusterEnd, e.ve);
      cluster.push(e);
    }
    flush();
  }

  // ── The live red "now" indicator ──────────────────────────────────────────
  function updateNow() {
    if (!nowEl) return;
    const now = new Date();
    nowEl.style.top = ((now.getHours() + now.getMinutes() / 60) * HOUR_H) + "px";
  }

  // ── Popover (event detail inspector) ──────────────────────────────────────
  function openPopover(e, anchor) {
    closePopover();
    const start = new Date(e.start), end = new Date(e.end);
    const dateLine = new Intl.DateTimeFormat(undefined,
      { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(start);
    const timeLine = e.allDay ? "all-day" : fmtRange(start, end);

    const pop = document.createElement("div");
    pop.className = "cal-pop";
    pop.innerHTML = `
      <button class="cal-pop-x" aria-label="Close">×</button>
      <div class="cal-pop-head">
        <span class="cal-pop-dot" style="background:${e.color}"></span>
        <h3 class="cal-pop-title">${esc(e.title)}</h3>
      </div>
      <div class="cal-pop-when">${esc(dateLine)}<br><span class="cal-pop-time">${esc(timeLine)}</span></div>
      ${e.calendar ? row("Calendar", esc(e.calendar), e.color) : ""}
      ${e.repeat ? row("Repeat", esc(repeatText(e.repeat))) : ""}
      ${e.location ? row("Location", esc(e.location)) : ""}
      ${e.description ? `<div class="cal-pop-notes">${esc(htmlToText(e.description))}</div>` : ""}`;

    const backdrop = document.createElement("div");
    backdrop.className = "cal-pop-backdrop";
    backdrop.appendChild(pop);
    root.appendChild(backdrop);

    // position near the clicked event, clamped to the widget
    const rb = root.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight, M = 8;
    let left = ab.right - rb.left + M;
    if (left + pw > rb.width - M) left = ab.left - rb.left - pw - M;
    if (left < M) left = M;
    let top = ab.top - rb.top;
    if (top + ph > rb.height - M) top = rb.height - ph - M;
    if (top < M) top = M;
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) closePopover(); });
    pop.querySelector(".cal-pop-x").addEventListener("click", closePopover);
    document.addEventListener("keydown", onEsc);
  }
  function row(label, value, color) {
    return `<div class="cal-pop-row"><span class="cal-pop-label">${label}</span>
      <span class="cal-pop-val">${color ? `<span class="cal-pop-cdot" style="background:${color}"></span>` : ""}${value}</span></div>`;
  }
  function onEsc(e) { if (e.key === "Escape") closePopover(); }
  function closePopover() {
    const b = root && root.querySelector(".cal-pop-backdrop");
    if (b) b.remove();
    document.removeEventListener("keydown", onEsc);
  }

  function repeatText(r) {
    const base = r.freq === "DAILY" ? "Every day"
      : r.byDay && r.byDay.length ? "Weekly on " + r.byDay.map((d) => DAYNAME[d] || d).join(", ")
      : "Weekly";
    if (r.until) {
      const u = new Date(r.until);
      return base + ", until " + new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(u);
    }
    return base;
  }

  // ── Small utilities ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function enc(e) {                                   // serialize for data-attr
    return esc(JSON.stringify({
      title: e.title, start: e.start, end: e.end, description: e.description,
      location: e.location, calendar: e.calendar, color: e.color,
      allDay: e.allDay, repeat: e.repeat,
    }));
  }
  function htmlToText(s) {
    if (!s) return "";
    const t = s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "");
    const ta = document.createElement("textarea"); ta.innerHTML = t;
    return ta.value.replace(/\n{3,}/g, "\n\n").trim();
  }

  // optional: if served over http, prefer an events.json written by Python
  function tryLoadJson() {
    fetch("events.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d) && d.length) Calendar.setEvents(d); })
      .catch(() => {});
  }
})();

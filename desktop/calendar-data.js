// Data layer (formerly main.py): turn a published ICS feed into the widget's
// event shape. Kept free of Electron imports so it can be unit-tested directly.
const ical = require("node-ical");

const COLOURS = ["#cc73e1", "#007aff", "#34c759", "#ff9500"];

function text(v) {
  if (v == null) return "";
  if (typeof v === "object") return String(v.val ?? "");
  return String(v);
}
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// node-ical builds VALUE=DATE events at *local* midnight, so read local
// components for all-day (toISOString would shift the day in +tz). Timed events
// are real instants → ISO (the widget renders them in local time).
function fmtStart(d, allDay) {
  if (!(d instanceof Date)) return null;
  return allDay ? ymd(d) : d.toISOString();
}
function fmtEnd(start, end, allDay) {
  if (!(end instanceof Date)) {
    return allDay && start instanceof Date ? ymd(start) : null;  // no DTEND → single day
  }
  if (allDay) {
    // ICS all-day DTEND is exclusive; the widget's all-day band is inclusive,
    // so step back a day to the actual last day shown.
    const last = new Date(end.getTime());
    last.setDate(last.getDate() - 1);
    if (start instanceof Date && last < start) return ymd(start);
    return ymd(last);
  }
  return end.toISOString();
}

const RRULE_FREQ = { 2: "WEEKLY", 3: "DAILY" };          // rrule lib: WEEKLY=2, DAILY=3
const RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]; // rrule weekday index
function convertRrule(rrule) {
  if (!rrule || !rrule.options) return null;
  const o = rrule.options;
  const frequency = RRULE_FREQ[o.freq];
  if (!frequency) return null;                  // widget only renders WEEKLY/DAILY
  const rep = { frequency };
  const byDay = (o.byweekday || [])
    .map((w) => RRULE_DAYS[typeof w === "number" ? w : w.weekday])
    .filter(Boolean);
  if (byDay.length) rep.byDay = byDay;
  if (o.until) {
    const u = new Date(o.until);
    if (!isNaN(u)) rep.until = u.toISOString().slice(0, 10);
  }
  return rep;
}

function convertEvents(parsed) {
  const out = [];
  let ci = 0;
  for (const key of Object.keys(parsed)) {
    const e = parsed[key];
    if (e.type !== "VEVENT") continue;
    const allDay = e.datetype === "date";
    const evt = {
      title: text(e.summary) || "(no title)",
      start: fmtStart(e.start, allDay),
      color: COLOURS[ci % COLOURS.length],
      allDay,
    };
    ci++;
    const end = fmtEnd(e.start, e.end, allDay);
    if (end) evt.end = end;
    const desc = text(e.description); if (desc) evt.description = desc;
    const loc = text(e.location);     if (loc) evt.location = loc;
    const repeat = convertRrule(e.rrule); if (repeat) evt.repeat = repeat;
    out.push(evt);
  }
  return out;
}

// Parse ICS text. Normalize any CR/LF mix (some exporters emit \r\r\n) to clean
// CRLF first, so a stray carriage return doesn't make the parser bail.
function parseICS(icsText) {
  const normalized = icsText.replace(/\r/g, "").replace(/\n/g, "\r\n");
  return convertEvents(ical.sync.parseICS(normalized));
}

async function fetchEventsFromUrl(url) {
  const target = url.trim().replace(/^webcal:\/\//i, "https://");
  const res = await fetch(target);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return parseICS(await res.text());
}

module.exports = { convertEvents, parseICS, fetchEventsFromUrl };

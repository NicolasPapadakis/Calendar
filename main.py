from asyncio import events
import datetime

import httpx
import asyncio
from icalendar import Calendar
import json
URI = "https://p197-caldav.icloud.com/published/2/MjA3NjY5MjU5NTIyMDc2Nn5Gpt0lbwqyYo-7I2fbhuPCnnjq_7XbJSNjlhgd9L53P5Qz1IY5qrIQ3JNqqv8Hyp-NnmaoMQe3F9sajsjpqoU"
COLOURS = ["#cc73e1","#007aff", "#34c759", "#ff9500"]
COLOURS_I = 0


async def get_events(uri : str) -> list:
    async with httpx.AsyncClient() as client:
        response = await client.get(uri)
        open("resp.txt", "w", encoding="utf-8").write(response.text)
        calendar = Calendar.from_ical(response.content)
        return calendar.walk('VEVENT')


def convert_events(events : list) -> list[dict]:
    global COLOURS_I
    res = list()
    
    for event in events:
        dct ={
            "title": str(event.get('summary')),
            "start": event.get('dtstart').dt,
            "end": event.get('dtend').dt,
            "color": COLOURS[COLOURS_I]
        }
        COLOURS_I = (COLOURS_I + 1) % len(COLOURS)
        if(event.get('description') != None):
            dct["description"] = str(event.get('description'))
        if(event.get('location') != None):
            dct["location"] = str(event.get('location'))
        # All-day events use DTSTART;VALUE=DATE, which icalendar decodes to a
        # datetime.date; timed events decode to datetime.datetime (a date subclass),
        # so exclude those explicitly. Works for single- and multi-day events.
        dct["allDay"] = isinstance(dct["start"], datetime.date) and not isinstance(dct["start"], datetime.datetime)
        if(event.get("rrule") != None):
            dct["repeat"] = {
                "frequency": event.get("rrule").get("FREQ")[0],
                "byDay": event.get("rrule").get("BYDAY") if event.get("rrule").get("BYDAY") != None else None,
                "until": event.get("rrule").get("UNTIL")[0] if event.get("rrule").get("UNTIL") != None else None
            }
        res.append(dct)
    return res


def _to_json(o):
    # date -> "2026-06-20" (date-only ⇒ all-day), datetime -> "2026-06-23T17:15:00"
    if isinstance(o, datetime.date):
        return o.isoformat()
    raise TypeError(f"not JSON serializable: {type(o)}")


async def main():
    print("Hello from calendar!")
    
    # open("resp.txt").close()
    events = await get_events(URI)
    # open("resp.txt", "w").write(str(events[0]))
    events = convert_events(events)
    print(f"{len(events)} events found.")
    js_code = f"window.Calendar.setEvents({json.dumps(events, default=_to_json)});"
    with open("widget/events.js", "w") as f:
        f.write(js_code)


if __name__ == "__main__":
    asyncio.run(main())

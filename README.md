
# Event Format

Events=[{
    "Name": "{SUMMARY}",
    "Description": "{DESCREAPTION}"
    "Start": "{DTSTART;VALUE=DATE},
    "End": "{DTEND;VALUE=DATE}",
    "Repeat":{
        "Frequency":"{RRULE:FREQ}",
        "ByDay":["TU", "TH"],
        "Until":"{RRULE:UNTIL}"
    }
}]

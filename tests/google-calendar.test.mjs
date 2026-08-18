import assert from "node:assert/strict";
import test from "node:test";
import { googleEventIdentity, localEventTime, readableSelectedCalendarIds } from "../lib/google-calendar.ts";

test("includes the primary and visible selected secondary calendars", () => {
  const ids = readableSelectedCalendarIds([
    { id: "student@gmail.com", primary: true, selected: true, accessRole: "owner" },
    { id: "university-timetable@group.calendar.google.com", selected: true, accessRole: "reader" },
    { id: "hidden@group.calendar.google.com", selected: true, hidden: true, accessRole: "reader" },
    { id: "unchecked@group.calendar.google.com", selected: false, accessRole: "reader" },
  ]);
  assert.deepEqual(ids, ["student@gmail.com", "university-timetable@group.calendar.google.com"]);
});

test("places an Adelaide morning class on the correct local day", () => {
  assert.deepEqual(localEventTime("2026-08-17T22:40:00.000Z", "Australia/Adelaide"), {
    date: "2026-08-18",
    minute: 8 * 60 + 10,
  });
});

test("deduplicates copied calendar events by iCal UID and occurrence time", () => {
  const event = { id: "copy-1", iCalUID: "class@example.edu", start: { dateTime: "2026-08-18T08:10:00+09:30" } };
  assert.equal(googleEventIdentity("primary", event), googleEventIdentity("timetable", { ...event, id: "copy-2" }));
});

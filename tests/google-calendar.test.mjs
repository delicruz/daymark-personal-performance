import assert from "node:assert/strict";
import test from "node:test";
import { calendarCategory, googleEventIdentity, localEventTime, longestOpenWindow, readableSelectedCalendarIds } from "../lib/google-calendar.ts";

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

test("classifies a rostered barista booking as work", () => {
  assert.equal(calendarCategory("[Argo On The Parade] Barista", 0), "work");
  assert.equal(calendarCategory("Cafe roster", 0), "work");
});

test("keeps university seminars classified as class before generic work terms", () => {
  assert.equal(calendarCategory("Professional Communication and Teamwork (INFO 2032) - Seminar", 0), "class");
});

test("finds the exact longest opening before a rostered work shift", () => {
  assert.deepEqual(longestOpenWindow([[11 * 60 + 45, 16 * 60 + 30]], 9 * 60, 17 * 60), {
    start: 9 * 60,
    end: 11 * 60 + 45,
    minutes: 165,
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyRecommendation } from "../lib/recommendation.ts";

test("combines a strong outlook, priority and pre-shift opening", () => {
  const result = buildDailyRecommendation({
    forecast: 74,
    modelStatus: "personalized",
    plannedFocusMinutes: 120,
    priorityTitle: "Finish project proposal",
    calendar: {
      classMinutes: 0,
      workMinutes: 285,
      meetingMinutes: 285,
      longestOpenMinutes: 165,
      longestOpenStartMinute: 540,
      longestOpenEndMinute: 705,
    },
    currentMinute: 480,
  });
  assert.equal(result.title, "Protect 9:00am–11:00am for “Finish project proposal”.");
  assert.match(result.rationale, /74\/100/);
  assert.match(result.rationale, /4h 45m of scheduled work/);
});

test("scales the focus block down on a lower-capacity class day", () => {
  const result = buildDailyRecommendation({
    forecast: 48,
    modelStatus: "calibrating",
    plannedFocusMinutes: 120,
    priorityTitle: "Draft assignment outline",
    calendar: {
      classMinutes: 280,
      workMinutes: 0,
      meetingMinutes: 280,
      longestOpenMinutes: 130,
      longestOpenStartMinute: 600,
      longestOpenEndMinute: 730,
    },
    currentMinute: 480,
  });
  assert.equal(result.targetMinutes, 45);
  assert.match(result.title, /10:00am–10:45am/);
  assert.match(result.rationale, /lower-capacity day/);
});

test("asks for a priority when none has been selected", () => {
  const result = buildDailyRecommendation({ forecast: 60, modelStatus: "baseline", plannedFocusMinutes: 90, priorityTitle: null, calendar: null });
  assert.equal(result.hasPriority, false);
  assert.match(result.title, /most important task/);
});

test("does not invent focus time on a fully booked workday", () => {
  const result = buildDailyRecommendation({
    forecast: 80,
    modelStatus: "personalized",
    plannedFocusMinutes: 120,
    priorityTitle: "Finish report",
    calendar: { classMinutes: 0, workMinutes: 480, meetingMinutes: 480, longestOpenMinutes: 0, longestOpenStartMinute: 540, longestOpenEndMinute: 540 },
  });
  assert.equal(result.targetMinutes, 0);
  assert.equal(result.timeLabel, "BUFFER FIRST");
});

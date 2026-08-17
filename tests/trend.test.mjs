import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarInsight, buildTrackedDayTrend } from "../lib/trend.ts";

test("trend uses the last seven tracked dates even when dates are not consecutive", () => {
  const dates = ["2026-08-01", "2026-08-03", "2026-08-06", "2026-08-09", "2026-08-10", "2026-08-14", "2026-08-17", "2026-08-20"];
  const checkins = dates.flatMap((entryDate, index) => [
    { entryDate, entryType: "morning", productivity: null },
    { entryDate, entryType: "evening", productivity: index + 2 },
  ]);
  const trend = buildTrackedDayTrend(checkins);
  assert.deepEqual(trend.points.map((point) => point.date), dates.slice(-7));
  assert.equal(trend.outcomeCount, 7);
});

test("morning-only tracked dates remain visible without inventing a score", () => {
  const trend = buildTrackedDayTrend([
    { entryDate: "2026-08-12", entryType: "evening", productivity: 7 },
    { entryDate: "2026-08-17", entryType: "morning", productivity: null },
  ]);
  assert.equal(trend.points.at(-1).score, null);
  assert.equal(trend.average, 70);
});

test("calendar insight requires paired outcomes and labels association", () => {
  const summaries = [60, 120, 180].map((meetingMinutes, index) => ({ summaryDate: `2026-08-0${index + 1}`, meetingCount: index + 1, meetingMinutes, focusMinutes: 480 - meetingMinutes }));
  const checkins = [9, 7, 5].map((productivity, index) => ({ entryDate: `2026-08-0${index + 1}`, entryType: "evening", productivity }));
  const insight = buildCalendarInsight(summaries, checkins);
  assert.equal(insight.pairedDays, 3);
  assert.match(insight.text, /association, not causation/i);
});

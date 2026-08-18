import test from "node:test";
import assert from "node:assert/strict";
import { buildInsightsSnapshot } from "../lib/insights.ts";

const morning = (entryDate, sleepMinutes = 450, stress = 2) => ({ entryDate, entryType: "morning", energy: 4, stress, sleepMinutes, productivity: null, focusedMinutes: null });
const evening = (entryDate, productivity, focusedMinutes = 120) => ({ entryDate, entryType: "evening", energy: null, stress: null, sleepMinutes: null, productivity, focusedMinutes });

test("offers distinct 7, 30 and 90 calendar-day windows", () => {
  const checkins = [morning("2026-08-18"), evening("2026-08-18", 8)];
  assert.equal(buildInsightsSnapshot(checkins, [], [], 7, "2026-08-18").series.length, 7);
  assert.equal(buildInsightsSnapshot(checkins, [], [], 30, "2026-08-18").series.length, 30);
  assert.equal(buildInsightsSnapshot(checkins, [], [], 90, "2026-08-18").series.length, 90);
});

test("keeps missing days visible without inventing outcomes", () => {
  const result = buildInsightsSnapshot([morning("2026-08-18")], [], [], 7, "2026-08-18");
  assert.equal(result.outcomeCount, 0);
  assert.equal(result.averageScore, null);
  assert.equal(result.series.at(-1).tracked, true);
  assert.equal(result.series.at(-1).score, null);
});

test("explains metrics from actual outcomes and priority history", () => {
  const checkins = [
    morning("2026-08-15", 480, 2), evening("2026-08-15", 8, 150),
    morning("2026-08-16", 450, 2), evening("2026-08-16", 7, 120),
    morning("2026-08-17", 360, 4), evening("2026-08-17", 5, 45),
    morning("2026-08-18", 390, 4), evening("2026-08-18", 6, 60),
  ];
  const priorities = [
    { priorityDate: "2026-08-18", completed: true },
    { priorityDate: "2026-08-18", completed: false },
  ];
  const result = buildInsightsSnapshot(checkins, priorities, [], 7, "2026-08-18");
  assert.equal(result.averageScore, 65);
  assert.equal(result.focusAverage, 94);
  assert.equal(result.priorityCompletion, 50);
  assert.equal(result.signals[0].label, "7+ hours of sleep");
  assert.equal(result.signals[0].change, 20);
});

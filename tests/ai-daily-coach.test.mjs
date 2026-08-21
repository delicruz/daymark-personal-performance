import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyCoachPrompt, buildPreviewDailyCoachPlan, buildRecentPerformanceSummary } from "../lib/ai-daily-coach.ts";

const context = {
  localDate: "2026-08-21",
  goal: "Plan more realistically",
  forecast: 68,
  rangeLow: 56,
  rangeHigh: 79,
  modelStatus: "personalized",
  energy: 4,
  stress: 2,
  sleepMinutes: 455,
  plannedFocusMinutes: 120,
  workload: "normal",
  priority: "Draft assignment outline",
  recentPerformance: {
    trackedDays: 7,
    averageScore: 7.4,
    latestScore: 8,
    averageFocusedMinutes: 96,
    trend: "improving",
  },
  calendar: {
    classMinutes: 210,
    studyMinutes: 0,
    workMinutes: 0,
    scheduledMinutes: 210,
    openMinutes: 270,
    longestOpenMinutes: 105,
    longestOpenStartMinute: 780,
    longestOpenEndMinute: 885,
  },
};

test("builds a grounded automatic prompt from schedules and recorded performance", () => {
  const prompt = buildDailyCoachPrompt(context);
  assert.match(prompt, /user has not written a request/);
  assert.match(prompt, /Do not calculate or alter the forecast/);
  assert.match(prompt, /exactly three actions/);
  assert.match(prompt, /recent recorded performance/);
  assert.match(prompt, /"classMinutes":210/);
  assert.match(prompt, /"forecast":68/);
  assert.match(prompt, /"averageScore":7.4/);
});

test("summarizes the most recent seven performance records without requiring consecutive days", () => {
  const summary = buildRecentPerformanceSummary([
    { entryDate: "2026-08-21", entryType: "evening", productivity: 8, focusedMinutes: 120 },
    { entryDate: "2026-08-19", entryType: "evening", productivity: 8, focusedMinutes: 90 },
    { entryDate: "2026-08-17", entryType: "evening", productivity: 7, focusedMinutes: 75 },
    { entryDate: "2026-08-14", entryType: "evening", productivity: 6, focusedMinutes: 60 },
    { entryDate: "2026-08-12", entryType: "evening", productivity: 6, focusedMinutes: null },
    { entryDate: "2026-08-10", entryType: "morning", productivity: null, focusedMinutes: null },
  ], "2026-08-21");
  assert.equal(summary.trackedDays, 5);
  assert.equal(summary.latestScore, 8);
  assert.equal(summary.averageScore, 7);
  assert.equal(summary.averageFocusedMinutes, 86.3);
  assert.equal(summary.trend, "improving");
});

test("creates a useful three-action local preview for the public demo", () => {
  const plan = buildPreviewDailyCoachPlan(context);
  assert.equal(plan.source, "preview");
  assert.equal(plan.actions.length, 3);
  assert.equal(plan.actions[0].durationMinutes, 75);
  assert.match(plan.actions[0].timing, /1:00pm/);
  assert.match(plan.actions[0].title, /Draft assignment outline/);
  assert.match(plan.summary, /7 recent performance records/);
  assert.match(plan.adjustment, /improving/);
  assert.match(plan.evidenceNote, /tested personal forecast/);
});

test("reduces scope when the user reports constrained capacity", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, forecast: 48, energy: 2, stress: 4 });
  assert.equal(plan.actions[0].durationMinutes, 35);
  assert.equal(plan.actions[0].effort, "moderate");
  assert.match(plan.headline, /lighter/);
  assert.match(plan.actions[2].title, /recovery/i);
});

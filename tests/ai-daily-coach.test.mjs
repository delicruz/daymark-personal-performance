import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyCoachPrompt, buildLocalDailyCoachPlan, buildPreviewDailyCoachPlan, buildRecentPerformanceSummary } from "../lib/ai-daily-coach.ts";

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
    trackedMorningDays: 7,
    averageScore: 7.4,
    latestScore: 8,
    averageFocusedMinutes: 96,
    averageSleepMinutes: 430,
    averageEnergy: 3.6,
    averageStress: 2.4,
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
  assert.match(prompt, /three distinct actions/);
  assert.match(prompt, /recent performance trend/);
  assert.match(prompt, /minimum version/);
  assert.match(prompt, /observable finish line/);
  assert.match(prompt, /never call it their 'most important outcome'/);
  assert.match(prompt, /daily experiment/);
  assert.match(prompt, /"classMinutes":210/);
  assert.match(prompt, /"forecast":68/);
  assert.match(prompt, /"averageScore":7.4/);
});

test("summarizes the most recent seven performance records without requiring consecutive days", () => {
  const summary = buildRecentPerformanceSummary([
    { entryDate: "2026-08-21", entryType: "morning", productivity: null, focusedMinutes: null, sleepMinutes: 420, energy: 4, stress: 2 },
    { entryDate: "2026-08-20", entryType: "morning", productivity: null, focusedMinutes: null, sleepMinutes: 390, energy: 3, stress: 3 },
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
  assert.equal(summary.trackedMorningDays, 2);
  assert.equal(summary.averageSleepMinutes, 405);
  assert.equal(summary.averageEnergy, 3.5);
  assert.equal(summary.averageStress, 2.5);
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
  assert.match(plan.actions[0].minimumVersion, /minute start/);
  assert.equal(plan.actions[0].steps.length, 3);
  assert.match(plan.actions[0].finishLine, /completed/);
  assert.equal(plan.dailyExperiment.title, "Test one protected block");
  assert.match(plan.evidenceNote, /tested personal forecast/);
});

test("reduces scope when the user reports constrained capacity", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, forecast: 48, energy: 2, stress: 4 });
  assert.equal(plan.actions[0].durationMinutes, 35);
  assert.equal(plan.actions[0].effort, "moderate");
  assert.match(plan.headline, /lighter/);
  assert.equal(plan.actions[1].category, "recovery");
  assert.match(plan.actions[1].title, /screen-free reset/i);
});

test("turns a below-usual sleep signal into a cautious measurable routine experiment", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, sleepMinutes: 330 });
  assert.equal(plan.dailyExperiment.title, "Protect a consistent wind-down");
  assert.match(plan.adjustment, /sleep is below your recent level/i);
  assert.equal(plan.actions[1].category, "recovery");
  assert.match(plan.dailyExperiment.successMeasure, /record sleep duration and morning energy/i);
});

test("protects transition time when the calendar is dense", () => {
  const plan = buildPreviewDailyCoachPlan({
    ...context,
    calendar: { ...context.calendar, scheduledMinutes: 390, classMinutes: 210, workMinutes: 180 },
  });
  assert.equal(plan.dailyExperiment.title, "Test transition buffers");
  assert.match(plan.adjustment, /dense calendar/i);
  assert.equal(plan.actions[1].category, "recovery");
  assert.match(plan.actions[1].reason, /busy scheduled day/i);
});

test("asks for a small outcome record instead of inventing a trend", () => {
  const plan = buildPreviewDailyCoachPlan({
    ...context,
    recentPerformance: {
      trackedDays: 0,
      trackedMorningDays: 1,
      averageScore: null,
      latestScore: null,
      averageFocusedMinutes: null,
      averageSleepMinutes: 455,
      averageEnergy: 4,
      averageStress: 2,
      trend: "not-enough-data",
    },
  });
  assert.match(plan.actions[2].reason, /future advice more personal/i);
  assert.match(plan.actions[2].minimumVersion, /outcome score/i);
  assert.doesNotMatch(plan.adjustment, /improving|lower than/i);
});

test("creates a transparent personalized fallback when OpenAI is unavailable", () => {
  const plan = buildLocalDailyCoachPlan(context, "fallback");
  assert.equal(plan.source, "fallback");
  assert.equal(plan.actions.length, 3);
  assert.match(plan.summary, /local plan/);
  assert.match(plan.actions[0].title, /Draft assignment outline/);
  assert.ok(plan.actions.every((action) => action.minimumVersion.length > 0));
  assert.ok(plan.dailyExperiment.successMeasure.length > 0);
  assert.match(plan.evidenceNote, /calculated this plan locally/);
});

test("turns a missing priority into an executable choice instead of vague advice", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, priority: null });
  assert.match(plan.actions[0].title, /choose one task/i);
  assert.equal(plan.actions[0].durationMinutes, 10);
  assert.match(plan.actions[0].steps[1], /nearest deadline or greatest consequence/i);
  assert.match(plan.actions[0].finishLine, /priority is saved/i);
  assert.match(plan.actions[1].title, /start the chosen task/i);
  assert.ok(plan.actions.every((action) => action.steps.length >= 2 && action.steps.length <= 3));
  assert.ok(plan.actions.every((action) => action.finishLine.length > 0));
  assert.doesNotMatch(JSON.stringify(plan.actions), /most important outcome|move .* forward|protect a transition buffer|close the loop/i);
});

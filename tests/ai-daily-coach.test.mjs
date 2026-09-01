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
  assert.match(prompt, /practical behavior changes/);
  assert.match(prompt, /Do not calculate or alter the forecast/);
  assert.match(prompt, /three distinct actions/);
  assert.match(prompt, /recent performance trend/);
  assert.match(prompt, /short fallback/);
  assert.match(prompt, /scan in a few seconds/);
  assert.match(prompt, /never invent the task/);
  assert.match(prompt, /daily experiment/);
  assert.match(prompt, /End optional work 30 minutes earlier tonight/);
  assert.match(prompt, /Never promise that an action will raise/);
  assert.match(prompt, /only one action may cover choosing or starting a task/);
  assert.match(prompt, /Do not repeat a focus instruction/);
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
  assert.match(plan.summary, /planned 2h of focus/i);
  assert.match(plan.summary, /recent completed average is 1h 36m/i);
  assert.match(plan.adjustment, /1h 35m/i);
  assert.match(plan.actions[0].minimumVersion, /Start with 25 minutes/);
  assert.equal(plan.dailyExperiment.title, "Test a realistic focus target");
  assert.match(plan.evidenceNote, /tested personal forecast/);
});

test("reduces scope when the user reports constrained capacity", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, forecast: 48, energy: 2, stress: 4 });
  assert.equal(plan.actions[0].durationMinutes, 35);
  assert.equal(plan.actions[0].effort, "moderate");
  assert.match(plan.headline, /shorten today’s work cycle/i);
  assert.equal(plan.actions[1].category, "recovery");
  assert.match(plan.actions[1].title, /phone-free break/i);
});

test("turns a below-usual sleep signal into a cautious measurable routine experiment", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, sleepMinutes: 330 });
  assert.equal(plan.dailyExperiment.title, "Test a 30-minute earlier stop");
  assert.match(plan.adjustment, /30 minutes earlier/i);
  assert.equal(plan.actions[1].category, "recovery");
  assert.match(plan.actions[1].title, /End optional work 30 minutes earlier/i);
  assert.match(plan.actions[1].reason, /5h 30m sleep versus a 7h 10m recent average/i);
  assert.match(plan.dailyExperiment.successMeasure, /compare sleep duration and morning energy/i);
});

test("protects transition time when the calendar is dense", () => {
  const plan = buildPreviewDailyCoachPlan({
    ...context,
    calendar: { ...context.calendar, scheduledMinutes: 390, classMinutes: 210, workMinutes: 180 },
  });
  assert.equal(plan.dailyExperiment.title, "Test one 10-minute transition");
  assert.match(plan.adjustment, /10 minutes unbooked/i);
  assert.equal(plan.actions[1].category, "schedule");
  assert.match(plan.actions[1].reason, /6h 30m is already scheduled/i);
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
  assert.match(plan.summary, /recent completed average/i);
  assert.match(plan.actions[0].title, /Draft assignment outline/);
  assert.ok(plan.actions.every((action) => action.minimumVersion.length > 0));
  assert.ok(plan.dailyExperiment.successMeasure.length > 0);
  assert.match(plan.availabilityNote, /does not use GPT/i);
  assert.match(plan.evidenceNote, /calculated this plan locally/);
});

test("explains a credit fallback without presenting it as an AI plan", () => {
  const plan = buildLocalDailyCoachPlan(
    context,
    "fallback",
    "AI suggestions are paused for this site because API credits are unavailable. This evidence-based backup was calculated locally and does not use GPT.",
  );
  assert.equal(plan.source, "fallback");
  assert.match(plan.availabilityNote, /API credits are unavailable/i);
  assert.match(plan.availabilityNote, /does not use GPT/i);
});

test("turns a missing priority into an executable choice instead of vague advice", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, priority: null });
  assert.match(plan.actions[0].title, /choose one task/i);
  assert.equal(plan.actions[0].durationMinutes, 10);
  assert.match(plan.actions[1].title, /cap today’s focus target at 1h 35m/i);
  assert.match(plan.actions[1].reason, /planned 2h/i);
  assert.match(plan.actions[1].reason, /recent completed average is 1h 36m/i);
  assert.match(plan.actions[2].title, /set tomorrow’s first task/i);
  assert.doesNotMatch(plan.actions[1].title, /start the chosen task/i);
  assert.ok(plan.actions.every((action) => action.minimumVersion.length <= 130));
  assert.doesNotMatch(JSON.stringify(plan.actions), /most important outcome|move .* forward|protect a transition buffer|close the loop/i);
  assert.doesNotMatch(JSON.stringify(plan), /increase sleep|increase rest|adjust your routine|work smarter/i);
});

test("uses a different measured signal for every card when no priority is saved", () => {
  const plan = buildPreviewDailyCoachPlan({
    ...context,
    priority: null,
    recentPerformance: { ...context.recentPerformance, trackedDays: 6, averageFocusedMinutes: 80 },
  });
  assert.equal(plan.actions[0].category, "focus");
  assert.equal(plan.actions[1].category, "schedule");
  assert.equal(plan.actions[2].category, "routine");
  assert.match(plan.headline, /recent pace/i);
  assert.match(plan.summary, /recent completed average is 1h 20m across 6 outcome records/i);
  assert.match(plan.actions[1].title, /1h 20m/i);
  assert.match(plan.adjustment, /compare it with completed focus tonight/i);
});

test("turns low energy into a specific shorter cycle and measurable break", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, energy: 2 });
  assert.match(plan.adjustment, /Cap planned focus at 90 minutes/i);
  assert.match(plan.adjustment, /15-minute phone-free break/i);
  assert.equal(plan.dailyExperiment.title, "Test a shorter focus cycle");
  assert.match(plan.actions[1].reason, /Energy is 2\/5 versus a 3.6\/5 recent average/i);
});

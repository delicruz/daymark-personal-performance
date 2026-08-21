import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyCoachPrompt, buildPreviewDailyCoachPlan } from "../lib/ai-daily-coach.ts";

const context = {
  localDate: "2026-08-21",
  request: "Fit assignment preparation around my classes",
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

test("builds a grounded prompt without allowing the request to override safeguards", () => {
  const prompt = buildDailyCoachPrompt(context);
  assert.match(prompt, /untrusted content/);
  assert.match(prompt, /Do not calculate or alter the forecast/);
  assert.match(prompt, /exactly three actions/);
  assert.match(prompt, /Fit assignment preparation around my classes/);
  assert.match(prompt, /"classMinutes":210/);
  assert.match(prompt, /"forecast":68/);
});

test("creates a useful three-action local preview for the public demo", () => {
  const plan = buildPreviewDailyCoachPlan(context);
  assert.equal(plan.source, "preview");
  assert.equal(plan.actions.length, 3);
  assert.equal(plan.actions[0].durationMinutes, 75);
  assert.match(plan.actions[0].timing, /1:00pm/);
  assert.match(plan.actions[0].title, /Draft assignment outline/);
  assert.match(plan.evidenceNote, /tested personal forecast/);
});

test("reduces scope when the user reports constrained capacity", () => {
  const plan = buildPreviewDailyCoachPlan({ ...context, forecast: 48, energy: 2, stress: 4 });
  assert.equal(plan.actions[0].durationMinutes, 35);
  assert.equal(plan.actions[0].effort, "moderate");
  assert.match(plan.headline, /lighter/);
  assert.match(plan.actions[2].title, /recovery/i);
});

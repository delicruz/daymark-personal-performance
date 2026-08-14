import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalForecast, MIN_PERSONALIZED_DAYS } from "../lib/prediction.ts";

function record(date, entryType, values = {}) {
  return {
    entryDate: date,
    entryType,
    energy: null,
    stress: null,
    sleepMinutes: null,
    workload: null,
    plannedFocusMinutes: null,
    productivity: null,
    ...values,
  };
}

function history(days) {
  const records = [];
  for (let index = 0; index < days; index += 1) {
    const date = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const energy = 1 + index % 5;
    const stress = 1 + (index * 2) % 5;
    const sleepMinutes = 330 + (index % 7) * 30;
    const plannedFocusMinutes = 60 + (index % 6) * 30;
    const workload = ["light", "normal", "heavy"][index % 3];
    const score = Math.max(0, Math.min(100, 48 + energy * 7 - stress * 4 + (sleepMinutes - 420) / 18 + plannedFocusMinutes / 30 - (workload === "heavy" ? 8 : workload === "light" ? -3 : 0)));
    records.push(record(date, "morning", { energy, stress, sleepMinutes, plannedFocusMinutes, workload }));
    records.push(record(date, "evening", { productivity: score / 10 }));
  }
  return records;
}

test("does not claim a personalized prediction before matched outcomes exist", () => {
  const result = buildPersonalForecast([], null);
  assert.equal(result.forecast, 50);
  assert.equal(result.model.status, "baseline");
  assert.equal(result.model.pairedDays, 0);
  assert.equal(result.model.mae, null);
  assert.deepEqual(result.model.signals, []);
});

test("waits for the declared minimum rather than using generic coefficients", () => {
  const result = buildPersonalForecast(history(MIN_PERSONALIZED_DAYS - 1), null);
  assert.equal(result.model.status, "calibrating");
  assert.equal(result.model.pairedDays, MIN_PERSONALIZED_DAYS - 1);
  assert.equal(result.model.backtestDays, 0);
  assert.deepEqual(result.model.signals, []);
});

test("fits ridge regression and reports forward-only backtest error", () => {
  const records = history(24);
  const current = record("2026-08-01", "morning", { energy: 5, stress: 1, sleepMinutes: 480, plannedFocusMinutes: 180, workload: "light" });
  const result = buildPersonalForecast(records, current);
  assert.equal(result.model.status, "personalized");
  assert.equal(result.model.pairedDays, 24);
  assert.equal(result.model.backtestDays, 10);
  assert.ok(result.model.mae !== null && Number.isFinite(result.model.mae));
  assert.ok(result.model.rangeLow <= result.forecast && result.forecast <= result.model.rangeHigh);
  assert.equal(result.model.signals.length, 5);
});

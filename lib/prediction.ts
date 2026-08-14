export const MIN_PERSONALIZED_DAYS = 14;
const RIDGE_PENALTY = 4;

export type PredictionRecord = {
  entryDate: string;
  entryType: "morning" | "evening";
  energy: number | null;
  stress: number | null;
  sleepMinutes: number | null;
  workload: string | null;
  plannedFocusMinutes: number | null;
  productivity: number | null;
};

export type ModelSignal = {
  label: string;
  impact: number;
  direction: "up" | "down" | "neutral";
};

export type ForecastModel = {
  method: "Personalized ridge regression";
  status: "baseline" | "calibrating" | "personalized";
  outcome: "HPQ-aligned self-rated work performance (0–10)";
  pairedDays: number;
  minimumDays: number;
  backtestDays: number;
  mae: number | null;
  confidence: "Baseline only" | "Early" | "Moderate";
  rangeLow: number;
  rangeHigh: number;
  rangeCoverage: 80;
  signals: ModelSignal[];
};

type Sample = { x: number[]; y: number };
type FittedModel = { means: number[]; targetMean: number; coefficients: number[] };

const featureNames = ["Energy", "Stress", "Sleep duration", "Planned focus", "Workload"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function features(record: PredictionRecord) {
  const workload = record.workload === "light" ? -1 : record.workload === "heavy" ? 1 : 0;
  return [
    clamp(((record.energy ?? 3) - 3) / 2, -1, 1),
    clamp(((record.stress ?? 3) - 3) / 2, -1, 1),
    clamp(((record.sleepMinutes ?? 420) - 420) / 120, -2, 2),
    clamp(((record.plannedFocusMinutes ?? 120) - 120) / 120, -1, 1),
    workload,
  ];
}

function solve(matrix: number[][], vector: number[]) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < matrix.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < matrix.length; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-10) return Array(matrix.length).fill(0) as number[];
    for (let index = column; index <= matrix.length; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= matrix.length; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[matrix.length]);
}

function fitRidge(samples: Sample[]): FittedModel {
  const dimension = samples[0].x.length;
  const means = Array.from({ length: dimension }, (_, index) => average(samples.map((sample) => sample.x[index])));
  const targetMean = average(samples.map((sample) => sample.y));
  const matrix = Array.from({ length: dimension }, () => Array(dimension).fill(0) as number[]);
  const vector = Array(dimension).fill(0) as number[];

  for (const sample of samples) {
    const centered = sample.x.map((value, index) => value - means[index]);
    const target = sample.y - targetMean;
    for (let row = 0; row < dimension; row += 1) {
      vector[row] += centered[row] * target;
      for (let column = 0; column < dimension; column += 1) matrix[row][column] += centered[row] * centered[column];
    }
  }
  for (let index = 0; index < dimension; index += 1) matrix[index][index] += RIDGE_PENALTY;
  return { means, targetMean, coefficients: solve(matrix, vector) };
}

function predict(model: FittedModel, input: number[]) {
  return model.targetMean + model.coefficients.reduce((sum, coefficient, index) => sum + coefficient * (input[index] - model.means[index]), 0);
}

function pairedSamples(records: PredictionRecord[]) {
  const byDate = new Map<string, { morning?: PredictionRecord; evening?: PredictionRecord }>();
  for (const record of records) {
    const pair = byDate.get(record.entryDate) ?? {};
    if (record.entryType === "morning") pair.morning = record;
    else pair.evening = record;
    byDate.set(record.entryDate, pair);
  }
  return [...byDate.entries()]
    .filter((entry): entry is [string, { morning: PredictionRecord; evening: PredictionRecord }] => Boolean(entry[1].morning && entry[1].evening?.productivity != null))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, pair]) => ({ x: features(pair.morning), y: clamp(Number(pair.evening.productivity) * 10, 0, 100) }));
}

export function buildPersonalForecast(records: PredictionRecord[], currentMorning: PredictionRecord | null) {
  const samples = pairedSamples(records);
  const input = features(currentMorning ?? {
    entryDate: "",
    entryType: "morning",
    energy: 3,
    stress: 3,
    sleepMinutes: 420,
    workload: "normal",
    plannedFocusMinutes: 120,
    productivity: null,
  });

  if (samples.length < MIN_PERSONALIZED_DAYS) {
    const score = Math.round(samples.length ? average(samples.map((sample) => sample.y)) : 50);
    const halfWidth = samples.length >= 7 ? 18 : 25;
    return {
      forecast: score,
      model: {
        method: "Personalized ridge regression",
        status: samples.length ? "calibrating" : "baseline",
        outcome: "HPQ-aligned self-rated work performance (0–10)",
        pairedDays: samples.length,
        minimumDays: MIN_PERSONALIZED_DAYS,
        backtestDays: 0,
        mae: null,
        confidence: samples.length ? "Early" : "Baseline only",
        rangeLow: clamp(score - halfWidth, 0, 100),
        rangeHigh: clamp(score + halfWidth, 0, 100),
        rangeCoverage: 80,
        signals: [],
      } satisfies ForecastModel,
    };
  }

  const errors: number[] = [];
  for (let index = MIN_PERSONALIZED_DAYS; index < samples.length; index += 1) {
    const historicalModel = fitRidge(samples.slice(0, index));
    errors.push(Math.abs(predict(historicalModel, samples[index].x) - samples[index].y));
  }
  const model = fitRidge(samples);
  const rawForecast = predict(model, input);
  const forecast = Math.round(clamp(rawForecast, 0, 100));
  const mae = errors.length ? average(errors) : null;
  const halfWidth = mae == null ? 18 : clamp(Math.round(mae * 1.6), 6, 25);
  const signals = model.coefficients
    .map((coefficient, index) => ({
      label: featureNames[index],
      impact: Math.round(coefficient * (input[index] - model.means[index])),
    }))
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .map((signal) => ({ ...signal, direction: signal.impact > 0 ? "up" as const : signal.impact < 0 ? "down" as const : "neutral" as const }));

  return {
    forecast,
    model: {
      method: "Personalized ridge regression",
      status: "personalized",
      outcome: "HPQ-aligned self-rated work performance (0–10)",
      pairedDays: samples.length,
      minimumDays: MIN_PERSONALIZED_DAYS,
      backtestDays: errors.length,
      mae: mae == null ? null : Math.round(mae * 10) / 10,
      confidence: samples.length >= 30 && mae != null && mae <= 15 ? "Moderate" : "Early",
      rangeLow: clamp(forecast - halfWidth, 0, 100),
      rangeHigh: clamp(forecast + halfWidth, 0, 100),
      rangeCoverage: 80,
      signals,
    } satisfies ForecastModel,
  };
}

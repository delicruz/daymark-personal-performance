export type TrendCheckin = {
  entryDate: string;
  entryType: "morning" | "evening";
  productivity: number | null;
};

export type CalendarSummaryInput = {
  summaryDate: string;
  meetingCount: number;
  meetingMinutes: number;
  focusMinutes: number;
};

export function buildTrackedDayTrend(checkins: TrendCheckin[]) {
  const trackedDates = new Set(checkins.map((entry) => entry.entryDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  const scoreByDate = new Map<string, number>();
  for (const entry of checkins) {
    if (entry.entryType === "evening" && entry.productivity != null && Number.isFinite(entry.productivity)) {
      scoreByDate.set(entry.entryDate, Math.round(Math.max(0, Math.min(10, entry.productivity)) * 10));
    }
  }

  const all = [...trackedDates].sort().map((date) => ({ date, score: scoreByDate.get(date) ?? null }));
  const points = all.slice(-7);
  const scored = all.filter((point): point is { date: string; score: number } => point.score != null);
  const recentScored = scored.slice(-7);
  const average = recentScored.length ? Math.round(recentScored.reduce((sum, point) => sum + point.score, 0) / recentScored.length) : null;
  const previousScored = scored.slice(Math.max(0, scored.length - recentScored.length * 2), Math.max(0, scored.length - recentScored.length));

  let comparison = "Add an evening review to create a score";
  let delta: number | null = null;
  if (average != null && previousScored.length) {
    const previousAverage = Math.round(previousScored.reduce((sum, point) => sum + point.score, 0) / previousScored.length);
    delta = average - previousAverage;
    comparison = `${delta >= 0 ? "+" : ""}${delta} pts vs previous tracked days`;
  } else if (recentScored.length >= 2) {
    delta = recentScored.at(-1)!.score - recentScored.at(-2)!.score;
    comparison = `${delta >= 0 ? "+" : ""}${delta} pts vs previous outcome`;
  } else if (recentScored.length === 1) {
    comparison = "First tracked outcome";
  }

  const peakDate = recentScored.length
    ? recentScored.reduce((peak, point) => point.score > peak.score ? point : peak).date
    : null;

  return { points, average, comparison, delta, outcomeCount: recentScored.length, peakDate };
}

export function buildCalendarInsight(summaries: CalendarSummaryInput[], checkins: TrendCheckin[]) {
  const outcomes = new Map(
    checkins
      .filter((entry) => entry.entryType === "evening" && entry.productivity != null)
      .map((entry) => [entry.entryDate, Math.round(Math.max(0, Math.min(10, entry.productivity!)) * 10)]),
  );
  const paired = summaries
    .filter((summary) => outcomes.has(summary.summaryDate))
    .map((summary) => ({ minutes: summary.meetingMinutes, score: outcomes.get(summary.summaryDate)! }))
    .sort((a, b) => a.minutes - b.minutes);

  if (paired.length < 3) {
    return { pairedDays: paired.length, text: `${paired.length} of 3 paired calendar and evening-review days. Keep tracking to unlock an insight.` };
  }

  const split = Math.ceil(paired.length / 2);
  const lighter = paired.slice(0, split);
  const busier = paired.slice(split);
  if (!busier.length) return { pairedDays: paired.length, text: "Keep tracking to compare lighter and busier calendar days." };
  const average = (rows: typeof paired) => rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  const difference = Math.round(average(lighter) - average(busier));
  const direction = difference === 0 ? "the same as" : `${Math.abs(difference)} points ${difference > 0 ? "higher" : "lower"} than`;
  return { pairedDays: paired.length, text: `Your lighter-calendar days average ${direction} busier days. This is an association, not causation.` };
}

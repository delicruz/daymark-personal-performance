export type InsightCheckin = {
  entryDate: string;
  entryType: "morning" | "evening";
  energy: number | null;
  stress: number | null;
  sleepMinutes: number | null;
  productivity: number | null;
  focusedMinutes: number | null;
};

export type InsightPriority = {
  priorityDate: string;
  completed: boolean;
};

export type InsightCalendar = {
  summaryDate: string;
  meetingMinutes: number;
};

type DailyRecord = {
  date: string;
  score: number | null;
  focusedMinutes: number | null;
  sleepMinutes: number | null;
  stress: number | null;
  energy: number | null;
  calendarMinutes: number;
};

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const roundAverage = (values: number[]) => {
  const result = average(values);
  return result == null ? null : Math.round(result);
};

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateRange(endDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => shiftDate(endDate, index - days + 1));
}

function compareGroups(records: DailyRecord[], label: string, first: (record: DailyRecord) => boolean, second: (record: DailyRecord) => boolean, note: string) {
  const firstScores = records.filter((record) => record.score != null && first(record)).map((record) => record.score!);
  const secondScores = records.filter((record) => record.score != null && second(record)).map((record) => record.score!);
  if (firstScores.length < 2 || secondScores.length < 2) return null;
  const difference = Math.round(average(firstScores)! - average(secondScores)!);
  return {
    label,
    change: difference,
    note: `${note} · ${firstScores.length + secondScores.length} paired days`,
    strength: Math.min(100, 28 + Math.abs(difference) * 5),
  };
}

export function buildInsightsSnapshot(
  checkins: InsightCheckin[],
  priorities: InsightPriority[],
  calendar: InsightCalendar[],
  days: 7 | 30 | 90,
  endDate: string,
) {
  const dates = dateRange(endDate, days);
  const dateSet = new Set(dates);
  const previousDates = new Set(dateRange(shiftDate(dates[0], -1), days));
  const records = new Map<string, DailyRecord>();
  const ensure = (date: string) => {
    const existing = records.get(date);
    if (existing) return existing;
    const created: DailyRecord = { date, score: null, focusedMinutes: null, sleepMinutes: null, stress: null, energy: null, calendarMinutes: 0 };
    records.set(date, created);
    return created;
  };

  for (const entry of checkins) {
    if (!validDate(entry.entryDate)) continue;
    const record = ensure(entry.entryDate);
    if (entry.entryType === "morning") {
      record.sleepMinutes = entry.sleepMinutes;
      record.stress = entry.stress;
      record.energy = entry.energy;
    } else {
      record.score = entry.productivity == null ? null : Math.round(Math.max(0, Math.min(10, entry.productivity)) * 10);
      record.focusedMinutes = entry.focusedMinutes;
    }
  }
  for (const summary of calendar) {
    if (validDate(summary.summaryDate)) ensure(summary.summaryDate).calendarMinutes = Math.max(0, summary.meetingMinutes);
  }

  const active = dates.map((date) => records.get(date) ?? ensure(date));
  const previous = [...previousDates].map((date) => records.get(date)).filter((record): record is DailyRecord => Boolean(record));
  const scores = active.flatMap((record) => record.score == null ? [] : [record.score]);
  const previousScores = previous.flatMap((record) => record.score == null ? [] : [record.score]);
  const averageScore = roundAverage(scores);
  const previousAverage = roundAverage(previousScores);
  const scoreDelta = averageScore == null || previousAverage == null ? null : averageScore - previousAverage;
  const trackedDays = new Set(checkins.filter((entry) => dateSet.has(entry.entryDate)).map((entry) => entry.entryDate)).size;
  const focusValues = active.flatMap((record) => record.focusedMinutes == null ? [] : [record.focusedMinutes]);
  const sleepValues = active.flatMap((record) => record.sleepMinutes == null ? [] : [record.sleepMinutes]);
  const windowPriorities = priorities.filter((priority) => dateSet.has(priority.priorityDate));
  const priorityCompletion = windowPriorities.length ? Math.round(windowPriorities.filter((priority) => priority.completed).length / windowPriorities.length * 100) : null;

  const weekdayGroups = new Map<string, number[]>();
  for (const record of active) {
    if (record.score == null) continue;
    const weekday = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(new Date(`${record.date}T12:00:00Z`));
    weekdayGroups.set(weekday, [...(weekdayGroups.get(weekday) ?? []), record.score]);
  }
  const bestWeekday = [...weekdayGroups].map(([day, values]) => ({ day, score: roundAverage(values)! })).sort((a, b) => b.score - a.score)[0] ?? null;

  const signals = [
    compareGroups(active, "7+ hours of sleep", (record) => (record.sleepMinutes ?? -1) >= 420, (record) => record.sleepMinutes != null && record.sleepMinutes < 420, "Compared with shorter-sleep days"),
    compareGroups(active, "2+ hours of focused work", (record) => (record.focusedMinutes ?? -1) >= 120, (record) => record.focusedMinutes != null && record.focusedMinutes < 120, "Compared with lower-focus days"),
    compareGroups(active, "Lower morning stress", (record) => record.stress != null && record.stress <= 2, (record) => (record.stress ?? -1) >= 4, "Compared with high-stress mornings"),
    compareGroups(active, "Lighter calendar load", (record) => record.calendarMinutes <= 180, (record) => record.calendarMinutes > 180, "Compared with 3+ scheduled hours"),
  ].filter((signal): signal is NonNullable<typeof signal> => signal != null).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  let summary = "Add an evening review to turn tracked days into an outcome trend.";
  if (averageScore != null && scoreDelta != null) summary = `Your average is ${Math.abs(scoreDelta)} points ${scoreDelta >= 0 ? "higher" : "lower"} than the previous ${days}-day period.`;
  else if (averageScore != null) summary = `Your ${scores.length} scored day${scores.length === 1 ? "" : "s"} average ${averageScore}/100. More evening reviews will make comparisons steadier.`;

  const topSignal = signals[0];
  const experiment = !topSignal
    ? { title: "Complete three evening reviews.", body: "Consistent outcomes are the fastest way to replace generic advice with a pattern grounded in your own days." }
    : topSignal.label.includes("sleep")
      ? { title: "Protect a 7-hour sleep window.", body: "Try this for one week, then compare the resulting evening scores with your shorter-sleep days." }
      : topSignal.label.includes("focused")
        ? { title: "Reserve one 2-hour focus block.", body: "Place it on three days this week and use the evening review to check whether the pattern repeats." }
        : topSignal.label.includes("stress")
          ? { title: "Start one morning more gently.", body: "Reduce the first-hour load, then compare energy, stress and the evening outcome with your usual mornings." }
          : { title: "Protect a meeting-light work block.", body: "Try one day with less than three scheduled hours and compare it with a busier calendar day." };

  return {
    days,
    dates,
    series: active.map((record) => ({ date: record.date, score: record.score, tracked: checkins.some((entry) => entry.entryDate === record.date) })),
    averageScore,
    scoreDelta,
    outcomeCount: scores.length,
    trackedDays,
    focusAverage: roundAverage(focusValues),
    sleepAverage: roundAverage(sleepValues),
    priorityCompletion,
    priorityCount: windowPriorities.length,
    bestWeekday,
    signals,
    summary,
    experiment,
    readiness: scores.length >= 14 ? "Established pattern" : scores.length >= 7 ? "Developing pattern" : "Early evidence",
  };
}

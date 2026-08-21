export type DailyCoachContext = {
  localDate: string;
  goal: string;
  forecast: number;
  rangeLow: number;
  rangeHigh: number;
  modelStatus: "baseline" | "calibrating" | "personalized";
  energy: number | null;
  stress: number | null;
  sleepMinutes: number | null;
  plannedFocusMinutes: number | null;
  workload: string | null;
  priority: string | null;
  recentPerformance: {
    trackedDays: number;
    averageScore: number | null;
    latestScore: number | null;
    averageFocusedMinutes: number | null;
    trend: "improving" | "steady" | "lower" | "not-enough-data";
  };
  calendar: {
    classMinutes: number;
    studyMinutes: number;
    workMinutes: number;
    scheduledMinutes: number;
    openMinutes: number;
    longestOpenMinutes: number;
    longestOpenStartMinute: number | null;
    longestOpenEndMinute: number | null;
  } | null;
};

export type DailyCoachPerformanceRecord = {
  entryDate: string;
  entryType: "morning" | "evening";
  productivity: number | null;
  focusedMinutes?: number | null;
};

export type DailyCoachAction = {
  title: string;
  timing: string;
  durationMinutes: number;
  effort: "light" | "moderate" | "deep";
  reason: string;
};

export type DailyCoachPlan = {
  headline: string;
  summary: string;
  actions: DailyCoachAction[];
  adjustment: string;
  evidenceNote: string;
  source: "ai" | "preview";
  generatedAt: string;
};

const roundedAverage = (values: number[]) => values.length
  ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
  : null;

export function buildRecentPerformanceSummary(records: DailyCoachPerformanceRecord[], localDate: string): DailyCoachContext["recentPerformance"] {
  const evenings = records
    .filter((entry) => entry.entryType === "evening" && entry.entryDate <= localDate && entry.productivity != null)
    .sort((left, right) => right.entryDate.localeCompare(left.entryDate))
    .slice(0, 7);
  const scores = evenings.map((entry) => Number(entry.productivity));
  const focusedMinutes = evenings.flatMap((entry) => entry.focusedMinutes == null ? [] : [Number(entry.focusedMinutes)]);
  const recentScores = scores.slice(0, 3);
  const earlierScores = scores.slice(3);
  const recentAverage = roundedAverage(recentScores);
  const earlierAverage = roundedAverage(earlierScores);
  const difference = recentAverage != null && earlierAverage != null ? recentAverage - earlierAverage : 0;

  return {
    trackedDays: evenings.length,
    averageScore: roundedAverage(scores),
    latestScore: scores[0] ?? null,
    averageFocusedMinutes: roundedAverage(focusedMinutes),
    trend: evenings.length < 4 ? "not-enough-data" : difference >= 0.5 ? "improving" : difference <= -0.5 ? "lower" : "steady",
  };
}

function formatClock(minutes: number | null) {
  if (minutes == null) return "when you have a clear opening";
  const safe = Math.max(0, Math.min(1439, minutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")}${suffix}`;
}

export function buildDailyCoachPrompt(context: DailyCoachContext) {
  return [
    "Create an automatic, realistic plan for one person for today using only the evidence below. The user has not written a request; infer the most useful suggestions from their schedule, recent recorded performance, current check-in, priority and saved goal.",
    "Do not calculate or alter the forecast. Do not claim that any signal causes performance. Do not invent calendar events, deadlines, medical guidance, or unavailable time windows.",
    "Use exactly three actions. Make each action concrete, kind, adjustable, and consistent with the available minutes. If capacity looks constrained, reduce scope and add recovery or buffer rather than demanding more output.",
    "Explicitly connect at least one suggestion to calendar availability and at least one suggestion to recent recorded performance. If there is not enough performance history, say so instead of inventing a trend.",
    "Use the supplied clock window only when it exists. The final evidence note must distinguish a personal-model forecast from a baseline or calibrating estimate.",
    `DAYMARK_CONTEXT_JSON=${JSON.stringify(context)}`,
  ].join("\n");
}

export function buildPreviewDailyCoachPlan(context: DailyCoachContext): DailyCoachPlan {
  const constrained = (context.energy != null && context.energy <= 2) || (context.stress != null && context.stress >= 4) || context.forecast < 55;
  const openStart = context.calendar?.longestOpenStartMinute ?? null;
  const openLength = context.calendar?.longestOpenMinutes ?? context.plannedFocusMinutes ?? 60;
  const focusMinutes = Math.max(20, Math.min(constrained ? 35 : 75, openLength || 45));
  const priority = context.priority ? `“${context.priority}”` : "your most important outcome";
  const firstTiming = openStart == null ? "Your clearest available block" : `From ${formatClock(openStart)}`;

  return {
    headline: constrained ? "Protect quality by making today deliberately lighter." : "Turn today’s strongest opening into one clear win.",
    summary: `This automatic preview combines today’s schedule, check-in, ${context.forecast}/100 outlook and ${context.recentPerformance.trackedDays || "no"} recent performance record${context.recentPerformance.trackedDays === 1 ? "" : "s"}.`,
    actions: [
      {
        title: `Move ${priority} forward`,
        timing: firstTiming,
        durationMinutes: focusMinutes,
        effort: constrained ? "moderate" : "deep",
        reason: constrained ? "A smaller finish line is more realistic with today’s lower available capacity." : "Your longest opening is the best place for work that needs uninterrupted attention.",
      },
      {
        title: "Create a visible stopping point",
        timing: "Immediately after the focus block",
        durationMinutes: 10,
        effort: "light",
        reason: "Write the next action before switching tasks so progress is easy to resume.",
      },
      {
        title: constrained ? "Leave recovery space" : "Review and rebalance",
        timing: "Before the next commitment",
        durationMinutes: constrained ? 20 : 15,
        effort: "light",
        reason: constrained ? "A buffer protects quality when energy is limited or stress is elevated." : "A short review lets you adjust the rest of the day without over-planning it.",
      },
    ],
    adjustment: context.recentPerformance.trend === "lower"
      ? "Recent recorded performance is lower than the earlier tracked days, so keep the finish line smaller and protect recovery space."
      : context.recentPerformance.trend === "improving"
        ? "Recent recorded performance is improving; protect the routine and calendar space that make steady work possible."
        : "Choose the smallest version of the plan that still feels meaningful, then adjust after the next commitment.",
    evidenceNote: context.modelStatus === "personalized" ? "Uses your tested personal forecast as context; suggestions remain planning guidance, not a prediction." : "Uses a baseline estimate as context; personal modelling has not yet collected enough matched outcomes.",
    source: "preview",
    generatedAt: new Date().toISOString(),
  };
}

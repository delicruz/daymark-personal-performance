export type RecommendationCalendar = {
  classMinutes: number;
  workMinutes: number;
  meetingMinutes: number;
  longestOpenMinutes: number;
  longestOpenStartMinute: number | null;
  longestOpenEndMinute: number | null;
};

export type DailyRecommendationInput = {
  forecast: number;
  modelStatus: "baseline" | "calibrating" | "personalized";
  plannedFocusMinutes: number | null;
  priorityTitle: string | null;
  calendar: RecommendationCalendar | null;
  currentMinute?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatClock(minutes: number) {
  const normalized = clamp(Math.round(minutes), 0, 1440);
  const hours = Math.floor(normalized / 60) % 24;
  const remainder = normalized % 60;
  const suffix = hours >= 12 ? "pm" : "am";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(remainder).padStart(2, "0")}${suffix}`;
}

export function buildDailyRecommendation(input: DailyRecommendationInput) {
  const outlookTarget = input.forecast >= 70 ? 120 : input.forecast >= 55 ? 75 : 45;
  const plannedTarget = input.plannedFocusMinutes == null ? outlookTarget : clamp(input.plannedFocusMinutes, 15, 240);
  const availableTarget = input.calendar?.longestOpenMinutes ? Math.min(plannedTarget, outlookTarget, input.calendar.longestOpenMinutes) : Math.min(plannedTarget, outlookTarget);
  const targetMinutes = Math.max(15, Math.floor(availableTarget / 15) * 15);
  const subject = input.priorityTitle ? `“${input.priorityTitle}”` : "your most important task";

  if (input.calendar && input.calendar.longestOpenMinutes < 15) {
    return {
      title: `Keep ${subject} as the next small step.`,
      rationale: `Your calendar has no open 15-minute block inside the working day. Avoid forcing another commitment; capture the next action and protect recovery time.`,
      targetMinutes: 0,
      timeLabel: "BUFFER FIRST",
      hasPriority: Boolean(input.priorityTitle),
    };
  }

  const openStart = input.calendar?.longestOpenStartMinute;
  const openEnd = input.calendar?.longestOpenEndMinute;
  const currentMinute = input.currentMinute ?? 0;
  const roundedCurrent = Math.ceil(currentMinute / 15) * 15;
  const usableStart = openStart == null || openEnd == null ? null : Math.max(openStart, roundedCurrent);
  const exactDuration = usableStart == null || openEnd == null ? 0 : Math.min(targetMinutes, openEnd - usableStart);
  const scheduledTitle = exactDuration >= 15
    ? `Protect ${formatClock(usableStart!)}–${formatClock(usableStart! + exactDuration)} for ${subject}.`
    : `Reserve ${formatMinutes(targetMinutes)} for ${subject}.`;

  const commitment = input.calendar?.workMinutes
    ? `${formatMinutes(input.calendar.workMinutes)} of scheduled work`
    : input.calendar?.classMinutes
      ? `${formatMinutes(input.calendar.classMinutes)} of classes`
      : input.calendar?.meetingMinutes
        ? `${formatMinutes(input.calendar.meetingMinutes)} of timed commitments`
        : "a mostly open calendar";
  const evidence = input.modelStatus === "personalized" ? "personal model" : input.modelStatus === "calibrating" ? "calibrating baseline" : "starting baseline";
  const pacing = input.forecast >= 70
    ? "Use this block for the most demanding part while your expected capacity is stronger."
    : input.forecast >= 55
      ? "Keep the scope concrete and leave a small buffer around scheduled commitments."
      : "Choose one small finish line and avoid overloading a lower-capacity day.";

  return {
    title: scheduledTitle,
    rationale: `Your ${evidence} is ${input.forecast}/100, with ${commitment}. ${pacing}`,
    targetMinutes: exactDuration >= 15 ? exactDuration : targetMinutes,
    timeLabel: `${exactDuration >= 15 ? exactDuration : targetMinutes} MIN`,
    hasPriority: Boolean(input.priorityTitle),
  };
}

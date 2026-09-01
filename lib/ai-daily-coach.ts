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
    trackedMorningDays: number;
    averageScore: number | null;
    latestScore: number | null;
    averageFocusedMinutes: number | null;
    averageSleepMinutes: number | null;
    averageEnergy: number | null;
    averageStress: number | null;
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
  sleepMinutes?: number | null;
  energy?: number | null;
  stress?: number | null;
};

export type DailyCoachAction = {
  category: "focus" | "schedule" | "recovery" | "routine";
  title: string;
  timing: string;
  durationMinutes: number;
  effort: "light" | "moderate" | "deep";
  reason: string;
  minimumVersion: string;
};

export type DailyCoachPlan = {
  headline: string;
  summary: string;
  actions: DailyCoachAction[];
  adjustment: string;
  dailyExperiment: {
    title: string;
    action: string;
    successMeasure: string;
  };
  evidenceNote: string;
  source: "ai" | "preview" | "fallback";
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
  const mornings = records
    .filter((entry) => entry.entryType === "morning"
      && entry.entryDate <= localDate
      && (entry.sleepMinutes != null || entry.energy != null || entry.stress != null))
    .sort((left, right) => right.entryDate.localeCompare(left.entryDate))
    .slice(0, 7);
  const sleepMinutes = mornings.flatMap((entry) => entry.sleepMinutes == null ? [] : [Number(entry.sleepMinutes)]);
  const energy = mornings.flatMap((entry) => entry.energy == null ? [] : [Number(entry.energy)]);
  const stress = mornings.flatMap((entry) => entry.stress == null ? [] : [Number(entry.stress)]);

  return {
    trackedDays: evenings.length,
    trackedMorningDays: mornings.length,
    averageScore: roundedAverage(scores),
    latestScore: scores[0] ?? null,
    averageFocusedMinutes: roundedAverage(focusedMinutes),
    averageSleepMinutes: roundedAverage(sleepMinutes),
    averageEnergy: roundedAverage(energy),
    averageStress: roundedAverage(stress),
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

function formatDuration(minutes: number | null) {
  if (minutes == null) return "not recorded";
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function buildDailyCoachPrompt(context: DailyCoachContext) {
  return [
    "# Goal\nCreate a concise plan of practical behavior changes the user can try today from their Daymark evidence. Do not give strategy, motivation or generic wellness advice.",
    "# Success criteria\nProvide three distinct actions covering the most relevant areas among focus, schedule, recovery and routine. Every action must contain a specific behavior, amount or duration, and timing cue. Explain the strongest observed signal in one short sentence and include one short fallback. Include one measurable daily experiment.",
    "# Evidence rules\nUse only the supplied schedule summary, current check-in, saved priority and goal, recent performance trend, and recent sleep/energy/stress/focus averages. Compare today with the person's own recent averages when both exist. When history is insufficient, frame the action as a test and explain what to track. Treat associations as clues, never causes.",
    "# Practicality rules\nKeep each card concise enough to scan in a few seconds. Write the title as the complete instruction and start it with an action verb. Never recommend 'more sleep', 'more rest', 'better balance', 'adjust your routine', 'work smarter' or 'improve focus' without saying exactly what behavior changes, by how much, and when. Example: prefer 'End optional work 30 minutes earlier tonight' over 'Get more rest'. If no priority is saved, tell the user to choose one; never invent the task. Do not add checklists or multiple substeps.",
    "# Planning rules\nRespect available minutes and the supplied clock window. Convert each relevant signal into the smallest realistic adjustment. When sleep is below the person's recent average, suggest a concrete earlier stop or wind-down change. When energy is low or stress is high, specify a short low-demand break and reduce the focus block. When the calendar is dense, name an exact transition buffer. Avoid repeating the same idea across actions.",
    "# Safety\nDo not calculate or alter the forecast. Do not invent events, deadlines, diagnoses, medical guidance, employment advice or unavailable time windows. Sleep, stress and energy suggestions must remain general wellbeing and planning guidance. Do not prescribe supplements, treatment, strict diets or exercise intensity.",
    "# Calibration\nNever promise that an action will raise the forecast or productivity index. Present lifestyle and routine changes as tests, then name the next check-in or outcome signal to compare. The evidence note distinguishes a personal-model forecast from a baseline or calibrating estimate. Keep the tone warm, direct and non-judgmental.",
    `DAYMARK_CONTEXT_JSON=${JSON.stringify(context)}`,
  ].join("\n");
}

export function buildLocalDailyCoachPlan(context: DailyCoachContext, source: "preview" | "fallback" = "preview"): DailyCoachPlan {
  const constrained = (context.energy != null && context.energy <= 2) || (context.stress != null && context.stress >= 4) || context.forecast < 55;
  const openStart = context.calendar?.longestOpenStartMinute ?? null;
  const openLength = context.calendar?.longestOpenMinutes ?? context.plannedFocusMinutes ?? 60;
  const focusMinutes = Math.max(20, Math.min(constrained ? 35 : 75, openLength || 45));
  const savedPriority = context.priority?.trim() || null;
  const priority = savedPriority ? `“${savedPriority}”` : null;
  const firstTiming = openStart == null ? "Your clearest available block" : `From ${formatClock(openStart)}`;
  const scheduleHeavy = (context.calendar?.scheduledMinutes ?? 0) >= 300;
  const sleepBelowUsual = context.sleepMinutes != null && context.recentPerformance.averageSleepMinutes != null
    ? context.sleepMinutes < context.recentPerformance.averageSleepMinutes - 45
    : context.sleepMinutes != null && context.sleepMinutes < 360;
  const recoveryNeeded = constrained || sleepBelowUsual || scheduleHeavy;
  const energyBelowUsual = context.energy != null && context.recentPerformance.averageEnergy != null
    ? context.energy < context.recentPerformance.averageEnergy - 0.5
    : context.energy != null && context.energy <= 2;
  const stressAboveUsual = context.stress != null && context.recentPerformance.averageStress != null
    ? context.stress > context.recentPerformance.averageStress + 0.5
    : context.stress != null && context.stress >= 4;
  const plannedMinutes = context.plannedFocusMinutes ?? focusMinutes;
  const reducedFocusMinutes = Math.max(25, Math.round((plannedMinutes * 0.75) / 5) * 5);
  const experiment = sleepBelowUsual
    ? {
        title: "Test a 30-minute earlier stop",
        action: "End optional work 30 minutes earlier tonight and keep that time screen-light and low-demand.",
        successMeasure: "Tomorrow, compare sleep duration and morning energy with your recent averages.",
      }
    : energyBelowUsual || stressAboveUsual
      ? {
          title: "Test a shorter focus cycle",
          action: `Cap the first focus block at ${focusMinutes} minutes, then take a 15-minute phone-free break.`,
          successMeasure: "At evening review, record focused minutes, productivity and the main interruption.",
        }
    : scheduleHeavy
      ? {
          title: "Test one 10-minute transition",
          action: "Keep one 10-minute unscheduled buffer after a class or work stretch before beginning the next task.",
          successMeasure: "At evening review, note whether the priority felt easier to start and record your stress score.",
        }
      : {
        title: "Test one notification-free block",
        action: `Run one ${focusMinutes}-minute block with notifications out of reach and one visible finish line.`,
          successMeasure: "At evening review, record focused minutes and whether the planned finish line was completed.",
        };

  return {
    headline: constrained ? "Protect quality by making today deliberately lighter." : "Turn today’s strongest opening into one clear win.",
    summary: `This ${source === "fallback" ? "local plan" : "automatic preview"} combines today’s schedule, check-in, ${context.forecast}/100 outlook and ${context.recentPerformance.trackedDays || "no"} recent performance record${context.recentPerformance.trackedDays === 1 ? "" : "s"}.`,
    actions: [
      savedPriority ? {
        category: "focus",
        title: `Work on ${priority} for ${focusMinutes} minutes`,
        timing: firstTiming,
        durationMinutes: focusMinutes,
        effort: constrained ? "moderate" : "deep",
        reason: constrained
          ? `Today’s ${context.forecast}/100 outlook calls for a smaller, clearly defined result.`
          : `Your longest open block is ${openLength} minutes, so this fits without overlapping a calendar commitment.`,
        minimumVersion: `Start with ${Math.max(10, Math.round(focusMinutes / 3))} minutes and write the next step.`,
      } : {
        category: "focus",
        title: "Choose one task and define today’s finish line",
        timing: firstTiming,
        durationMinutes: 10,
        effort: "light",
        reason: "No priority is saved, so Daymark needs one concrete task before it can recommend what to work on.",
        minimumVersion: "Save the task with the nearest deadline.",
      },
      !savedPriority ? {
        category: "focus",
        title: `Start the chosen task with a ${focusMinutes}-minute sprint`,
        timing: "Immediately after choosing the priority",
        durationMinutes: focusMinutes,
        effort: constrained ? "moderate" : "deep",
        reason: constrained
          ? `Today’s ${context.forecast}/100 outlook supports a shorter single-task block instead of a long work session.`
          : `Your longest open block is ${openLength} minutes, leaving enough room for one uninterrupted start.`,
        minimumVersion: "Work for 15 minutes and record the next action.",
      } : sleepBelowUsual ? {
        category: "recovery",
        title: "End optional work 30 minutes earlier tonight",
        timing: "Before your usual wind-down",
        durationMinutes: 30,
        effort: "light",
        reason: `You logged ${formatDuration(context.sleepMinutes)} sleep versus a ${formatDuration(context.recentPerformance.averageSleepMinutes)} recent average; test the change rather than assuming it will raise your score.`,
        minimumVersion: "Put screens away 10 minutes earlier tonight.",
      } : energyBelowUsual || stressAboveUsual ? {
        category: "recovery",
        title: "Take a 15-minute phone-free break",
        timing: "Immediately after the focus block",
        durationMinutes: 15,
        effort: "light",
        reason: energyBelowUsual
          ? `Energy is ${context.energy}/5 versus a ${context.recentPerformance.averageEnergy}/5 recent average.`
          : `Stress is ${context.stress}/5 versus a ${context.recentPerformance.averageStress}/5 recent average.`,
        minimumVersion: "Step away from the screen for 5 minutes.",
      } : scheduleHeavy ? {
        category: "schedule",
        title: "Leave 10 minutes unbooked after your busiest commitment",
        timing: "After your longest class or work stretch",
        durationMinutes: 10,
        effort: "light",
        reason: `${formatDuration(context.calendar?.scheduledMinutes ?? 0)} is already scheduled today, so this prevents an immediate task switch.`,
        minimumVersion: "Leave 5 minutes before starting the next task.",
      } : {
        category: recoveryNeeded ? "recovery" : "schedule",
        title: recoveryNeeded ? "Take a 15-minute screen-free reset" : "Write the next action before switching tasks",
        timing: "Immediately after the focus block",
        durationMinutes: recoveryNeeded ? 15 : 10,
        effort: "light",
        reason: recoveryNeeded
          ? `Today’s ${context.forecast}/100 outlook supports a short reset before another demanding task.`
          : "Writing one next action makes the task easier to resume after switching.",
        minimumVersion: "Pause for 5 minutes and write the next action.",
      },
      {
        category: "routine",
        title: "Record three facts in the evening review",
        timing: "At the end of your planned workday",
        durationMinutes: 5,
        effort: "light",
        reason: context.recentPerformance.trackedDays < 4
          ? "A short outcome record will make future advice more personal instead of relying on a starting baseline."
          : "Focused minutes and an outcome score let Daymark compare today’s plan with your recent pattern.",
        minimumVersion: "Save the outcome score and one short note.",
      },
    ],
    adjustment: sleepBelowUsual
      ? "End optional work 30 minutes earlier tonight, then compare tomorrow’s sleep and energy with your recent averages."
      : energyBelowUsual || stressAboveUsual
        ? `Cap planned focus at ${reducedFocusMinutes} minutes today and place a 15-minute phone-free break after the first block.`
      : scheduleHeavy
        ? "Leave 10 minutes unbooked after your busiest commitment before starting the next task."
        : context.recentPerformance.trend === "lower"
          ? `Cap planned focus at ${reducedFocusMinutes} minutes today; complete one priority, then record the outcome before adding more work.`
          : context.recentPerformance.trend === "improving"
            ? `Repeat one ${focusMinutes}-minute notification-free block in your longest opening; do not add a second block until it is complete.`
            : `Run one ${focusMinutes}-minute notification-free block, then record focused minutes and the outcome tonight.`,
    dailyExperiment: experiment,
    evidenceNote: `${context.modelStatus === "personalized" ? "Uses your tested personal forecast as context; suggestions remain planning guidance, not a prediction." : "Uses a baseline estimate as context; personal modelling has not yet collected enough matched outcomes."}${source === "fallback" ? " OpenAI generation is temporarily unavailable, so Daymark calculated this plan locally from the same summarized signals." : ""}`,
    source,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPreviewDailyCoachPlan(context: DailyCoachContext): DailyCoachPlan {
  return buildLocalDailyCoachPlan(context, "preview");
}

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
  steps: string[];
  finishLine: string;
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

export function buildDailyCoachPrompt(context: DailyCoachContext) {
  return [
    "# Goal\nCreate a practical automatic plan that helps one person make better daily choices from their Daymark evidence. The user has not written a request, so proactively select the highest-value adjustments.",
    "# Success criteria\nProvide three distinct actions covering the most relevant areas among focus, schedule, recovery and routine. Every action names when to do it, a realistic duration, the specific observed signal behind it, two or three ordered steps, an observable finish line, and a minimum version for a disrupted day. Include one small daily experiment with a behavior and an evening-review measure.",
    "# Evidence rules\nUse only the supplied schedule summary, current check-in, saved priority and goal, recent performance trend, and recent sleep/energy/stress/focus averages. Compare today with the person's own recent averages when both exist. When history is insufficient, frame the action as a test and explain what to track. Treat associations as clues, never causes.",
    "# Action quality bar\nWrite each title as a direct instruction the user can start without interpretation. Start every step with an action verb and name the object, tool, amount or time where the evidence supports it. Make finishLine visibly checkable. If no priority is saved, help the user choose one; never call it their 'most important outcome' and never invent the task. Avoid abstract phrases such as 'move it forward', 'protect a buffer', 'close the loop' or 'review and rebalance' unless the same sentence says exactly what to do.",
    "# Planning rules\nRespect available minutes and the supplied clock window. Prefer exact, low-friction behaviors over broad advice. If capacity is constrained, reduce scope, protect transitions and add recovery rather than demanding more output. Avoid repeating the same idea across actions.",
    "# Safety\nDo not calculate or alter the forecast. Do not invent events, deadlines, diagnoses, medical guidance, employment advice or unavailable time windows. Sleep, stress and energy suggestions must remain general wellbeing and planning guidance. Do not prescribe supplements, treatment, strict diets or exercise intensity.",
    "# Calibration\nThe evidence note distinguishes a personal-model forecast from a baseline or calibrating estimate and names important missing evidence. Keep the tone warm, direct and non-judgmental.",
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
  const experiment = sleepBelowUsual
    ? {
        title: "Protect a consistent wind-down",
        action: "Choose a 30-minute low-stimulation wind-down window tonight and stop planned work when it begins.",
        successMeasure: "Tomorrow, record sleep duration and morning energy; compare them with your recent averages.",
      }
    : scheduleHeavy
      ? {
          title: "Test transition buffers",
          action: "Keep one 10-minute unscheduled buffer after a class or work stretch before beginning the next task.",
          successMeasure: "At evening review, note whether the priority felt easier to start and record your stress score.",
        }
      : {
          title: "Test one protected block",
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
        steps: [
          `Write one sentence describing what must be finished for ${priority} in this block.`,
          `Silence notifications and work only on ${priority} for ${Math.max(15, focusMinutes - 5)} minutes.`,
          "Use the final 5 minutes to save the work and write the next action.",
        ],
        finishLine: `One visible part of ${priority} is completed and its next action is written.`,
        minimumVersion: `Complete one ${Math.max(10, Math.round(focusMinutes / 3))}-minute start and write the next step.`,
      } : {
        category: "focus",
        title: "Choose one task and define today’s finish line",
        timing: firstTiming,
        durationMinutes: 10,
        effort: "light",
        reason: "No priority is saved, so Daymark needs one concrete task before it can recommend what to work on.",
        steps: [
          "List the three tasks currently competing for your attention.",
          "Choose the task with the nearest deadline or greatest consequence.",
          "Save it as your priority and write one sentence describing what ‘done today’ means.",
        ],
        finishLine: "One priority is saved in Daymark with a specific result for today.",
        minimumVersion: "Save one task and the smallest useful result you can finish today.",
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
        steps: [
          "Open only the file, page or tool needed for the chosen task.",
          `Work on the written finish line for ${Math.max(15, focusMinutes - 5)} minutes with notifications silenced.`,
          "Use the final 5 minutes to save the work and write the next action.",
        ],
        finishLine: "The written result is completed, or the next unfinished action is clearly recorded.",
        minimumVersion: "Work for 15 minutes on the first unfinished part and record the next action.",
      } : {
        category: recoveryNeeded ? "recovery" : "schedule",
        title: recoveryNeeded ? "Take a 15-minute screen-free reset" : "Write the next action before switching tasks",
        timing: scheduleHeavy ? "After your busiest class or work stretch" : "Immediately after the focus block",
        durationMinutes: recoveryNeeded ? 15 : 10,
        effort: "light",
        reason: sleepBelowUsual
          ? "Today’s sleep is below your recent level, so a low-demand transition is more realistic than filling every open minute."
          : scheduleHeavy
            ? "A busy scheduled day leaves less room for task switching and recovery."
            : "Writing the next action before switching tasks makes progress easier to resume.",
        steps: recoveryNeeded
          ? [
              "Leave the desk and put the phone out of reach.",
              "Drink water or walk gently for 10 minutes without starting another task.",
              "Return and write the single next action before opening anything else.",
            ]
          : [
              "Stop when the focus timer ends.",
              "Write the exact next action in one sentence.",
              "Close the task before opening the next one.",
            ],
        finishLine: recoveryNeeded
          ? "You return after 15 minutes with one next action written."
          : "The current task is closed and one next action is written.",
        minimumVersion: "Step away for 5 minutes, then write the next action before switching tasks.",
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
        steps: [
          "Enter today’s focused minutes.",
          "Score today’s productivity from 1 to 10.",
          "Write the single biggest help or interruption.",
        ],
        finishLine: "Focused minutes, productivity score and one observation are saved.",
        minimumVersion: "Record the outcome score and one sentence about what helped or interrupted the plan.",
      },
    ],
    adjustment: sleepBelowUsual
      ? "Today’s sleep is below your recent level. Keep the priority, reduce optional workload, and protect a calmer transition into tonight."
      : scheduleHeavy
        ? "Today has a dense calendar. Protect the priority by leaving one transition unbooked instead of treating every open minute as usable focus time."
        : context.recentPerformance.trend === "lower"
          ? "Recent recorded performance is lower than the earlier tracked days, so keep the finish line smaller and protect recovery space."
          : context.recentPerformance.trend === "improving"
            ? "Recent recorded performance is improving; protect the routine and calendar space that make steady work possible."
            : "Choose the smallest version of the plan that still feels meaningful, then adjust after the next commitment.",
    dailyExperiment: experiment,
    evidenceNote: `${context.modelStatus === "personalized" ? "Uses your tested personal forecast as context; suggestions remain planning guidance, not a prediction." : "Uses a baseline estimate as context; personal modelling has not yet collected enough matched outcomes."}${source === "fallback" ? " OpenAI generation is temporarily unavailable, so Daymark calculated this plan locally from the same summarized signals." : ""}`,
    source,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPreviewDailyCoachPlan(context: DailyCoachContext): DailyCoachPlan {
  return buildLocalDailyCoachPlan(context, "preview");
}

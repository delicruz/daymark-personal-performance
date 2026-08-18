export type GoogleCalendarListEntry = {
  id?: string;
  primary?: boolean;
  selected?: boolean;
  hidden?: boolean;
  deleted?: boolean;
  accessRole?: string;
};

export type TimedGoogleEvent = {
  id?: string;
  iCalUID?: string;
  start?: { dateTime?: string };
};

const READABLE_ROLES = new Set(["reader", "writerWithoutPrivateAccess", "writer", "owner"]);

export function readableSelectedCalendarIds(entries: GoogleCalendarListEntry[], limit = 50) {
  const ids = entries
    .filter((entry) => (
      typeof entry.id === "string"
      && entry.id.length > 0
      && !entry.deleted
      && !entry.hidden
      && (entry.primary || entry.selected)
      && READABLE_ROLES.has(entry.accessRole ?? "")
    ))
    .map((entry) => entry.id as string);

  return [...new Set(ids)].slice(0, limit);
}

export function localEventTime(value: string, timeZone: string) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { date: `${year}-${month}-${day}`, minute: hour * 60 + minute };
}

export function googleEventIdentity(calendarId: string, event: TimedGoogleEvent) {
  const start = event.start?.dateTime ?? "";
  return event.iCalUID && start ? `${event.iCalUID}|${start}` : `${calendarId}|${event.id ?? ""}|${start}`;
}

export function calendarCategory(summary: string, attendeeCount: number) {
  const value = summary.toLocaleLowerCase();
  if (/\b(lecture|tutorial|seminar|class|lab|laboratory|workshop|uni|university|campus)\b/.test(value)) return "class" as const;
  if (/\b(study|revision|revise|assignment|coursework|exam prep|reading|research)\b/.test(value)) return "study" as const;
  if (/\b(work|shift|roster|on duty|clock.?in|client|office|project|deep work|focus block|barista|bartender|cashier|retail|hospitality|restaurant|cafe|café|waitstaff|waiter|waitress|server|chef|cook|kitchen|front of house|back of house|receptionist|warehouse|delivery|support worker|care worker|nurse)\b/.test(value)) return "work" as const;
  if (attendeeCount > 1 || /\b(meeting|call|sync|standup|scrum|interview|catch.?up)\b/.test(value)) return "meeting" as const;
  return "personal" as const;
}

export function longestOpenWindow(intervals: [number, number][], workStart: number, workEnd: number) {
  const busy = intervals
    .map(([start, end]) => [Math.max(start, workStart), Math.min(end, workEnd)] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0])
    .reduce<[number, number][]>((merged, interval) => {
      const previous = merged.at(-1);
      if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
      return merged;
    }, []);

  let cursor = workStart;
  let longest = { start: workStart, end: workStart, minutes: 0 };
  for (const [start, end] of busy) {
    if (start - cursor > longest.minutes) longest = { start: cursor, end: start, minutes: start - cursor };
    cursor = Math.max(cursor, end);
  }
  if (workEnd - cursor > longest.minutes) longest = { start: cursor, end: workEnd, minutes: workEnd - cursor };
  return longest;
}

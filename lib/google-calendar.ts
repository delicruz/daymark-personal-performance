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

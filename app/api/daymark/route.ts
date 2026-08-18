import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildPersonalForecast } from "../../../lib/prediction";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_REQUEST_BYTES = 16_384;

const boundedNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

type AuthenticatedUser = { userId: string; email: string; displayName: string };
type RequestContext = { user: AuthenticatedUser; supabase: SupabaseClient };
type DatabaseRecord = Record<string, unknown>;
type GoogleCalendarEvent = {
  summary?: string;
  status?: string;
  transparency?: string;
  eventType?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0");
  responseHeaders.set("Pragma", "no-cache");
  responseHeaders.set("Vary", "Authorization");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { status, headers: responseHeaders });
}

function environment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase environment variables are not configured.");
  return { url, publishableKey };
}

async function requestContext(request: Request): Promise<RequestContext | null> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) return null;

  const { url, publishableKey } = environment();
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;

  const metadata = data.user.user_metadata as Record<string, unknown>;
  const displayName = String(metadata.full_name ?? metadata.name ?? data.user.email.split("@")[0]);
  return { user: { userId: data.user.id, email: data.user.email, displayName }, supabase };
}

async function bootstrapUser({ user, supabase }: RequestContext) {
  const { error } = await supabase.from("daymark_users").upsert({
    user_id: user.userId,
    email: user.email,
    display_name: user.displayName,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function enforceRateLimit({ supabase }: RequestContext) {
  const { data, error } = await supabase.rpc("daymark_consume_rate_limit");
  if (error) {
    console.error("[daymark] rate limiter unavailable", error);
    return jsonResponse({ error: "Daymark is temporarily unavailable. Please try again shortly." }, 503, { "Retry-After": "10" });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; remaining?: number; retry_after_seconds?: number } | null;
  if (!row?.allowed) {
    const retryAfter = Math.max(1, Number(row?.retry_after_seconds ?? 60));
    return jsonResponse({ error: "Too many requests. Please wait a moment and try again." }, 429, {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": "60",
      "X-RateLimit-Remaining": "0",
    });
  }
  return null;
}

async function readPayload(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { response: jsonResponse({ error: "Request body is too large." }, 413) };
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { response: jsonResponse({ error: "Content-Type must be application/json." }, 415) };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return { response: jsonResponse({ error: "Request body is too large." }, 413) };
  }
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid JSON object");
    return { data: data as Record<string, unknown> };
  } catch {
    return { response: jsonResponse({ error: "Request body must be a valid JSON object." }, 400) };
  }
}

function mapProfile(row: DatabaseRecord | null) {
  if (!row) return null;
  return {
    displayName: String(row.display_name ?? ""),
    email: String(row.email ?? ""),
    goal: String(row.goal ?? "Improve daily focus"),
    calendarConnected: Boolean(row.calendar_connected),
  };
}

function mapCheckin(row: DatabaseRecord) {
  return {
    id: Number(row.id),
    entryDate: String(row.entry_date),
    entryType: row.entry_type === "evening" ? "evening" as const : "morning" as const,
    energy: row.energy == null ? null : Number(row.energy),
    stress: row.stress == null ? null : Number(row.stress),
    sleepMinutes: row.sleep_minutes == null ? null : Number(row.sleep_minutes),
    workload: row.workload == null ? null : String(row.workload),
    plannedFocusMinutes: row.planned_focus_minutes == null ? null : Number(row.planned_focus_minutes),
    productivity: row.productivity == null ? null : Number(row.productivity),
    focusedMinutes: row.focused_minutes == null ? null : Number(row.focused_minutes),
    reflection: row.reflection == null ? null : String(row.reflection),
    prediction: row.prediction == null ? null : Number(row.prediction),
  };
}

function mapPriority(row: DatabaseRecord) {
  return {
    id: Number(row.id),
    title: String(row.title),
    impact: String(row.impact),
    completed: Boolean(row.completed),
  };
}

function mapCalendarSummary(row: DatabaseRecord) {
  return {
    summaryDate: String(row.summary_date),
    meetingCount: Number(row.meeting_count),
    meetingMinutes: Number(row.meeting_minutes),
    focusMinutes: Number(row.focus_minutes),
    classMinutes: Number(row.class_minutes ?? 0),
    studyMinutes: Number(row.study_minutes ?? 0),
    workMinutes: Number(row.work_minutes ?? 0),
    personalMinutes: Number(row.personal_minutes ?? 0),
    longestOpenMinutes: Number(row.longest_open_minutes ?? 0),
    firstEventMinute: row.first_event_minute == null ? null : Number(row.first_event_minute),
    lastEventMinute: row.last_event_minute == null ? null : Number(row.last_event_minute),
    syncedAt: String(row.synced_at),
  };
}

function clockMinutes(value: unknown, fallback: number) {
  const match = String(value ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : fallback;
}

function unionMinutes(intervals: [number, number][]) {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const interval of sorted) {
    if (!current) current = [...interval];
    else if (interval[0] <= current[1]) current[1] = Math.max(current[1], interval[1]);
    else { total += current[1] - current[0]; current = [...interval]; }
  }
  return Math.round(total + (current ? current[1] - current[0] : 0));
}

function mergeIntervals(intervals: [number, number][]) {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function longestOpenMinutes(intervals: [number, number][], workStart: number, workEnd: number) {
  const busy = mergeIntervals(intervals.map(([start, end]) => [Math.max(start, workStart), Math.min(end, workEnd)]));
  let cursor = workStart;
  let longest = 0;
  for (const [start, end] of busy) {
    longest = Math.max(longest, start - cursor);
    cursor = Math.max(cursor, end);
  }
  return Math.max(longest, workEnd - cursor, 0);
}

function calendarCategory(summary: string, attendeeCount: number) {
  const value = summary.toLocaleLowerCase();
  if (/\b(lecture|tutorial|seminar|class|lab|laboratory|workshop|uni|university|campus)\b/.test(value)) return "class" as const;
  if (/\b(study|revision|revise|assignment|coursework|exam prep|reading|research)\b/.test(value)) return "study" as const;
  if (/\b(work|shift|client|office|project|deep work|focus block)\b/.test(value)) return "work" as const;
  if (attendeeCount > 1 || /\b(meeting|call|sync|standup|scrum|interview|catch.?up)\b/.test(value)) return "meeting" as const;
  return "personal" as const;
}

async function syncGoogleCalendar(context: RequestContext, providerToken: string, timeZone: string) {
  if (providerToken.length < 20 || providerToken.length > 4096) throw new Error("INVALID_GOOGLE_TOKEN");
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw new Error("INVALID_TIME_ZONE"); }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 35 * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const events: GoogleCalendarEvent[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      timeZone,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      fields: "items(summary,status,transparency,eventType,start,end,attendees(self,responseStatus)),nextPageToken",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) throw new Error("GOOGLE_CALENDAR_PERMISSION");
    if (!response.ok) throw new Error("GOOGLE_CALENDAR_UNAVAILABLE");
    const body = await response.json() as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken && events.length < 10_000);

  const { data: profile, error: profileError } = await context.supabase
    .from("daymark_users")
    .select("working_start,working_end")
    .eq("user_id", context.user.userId)
    .single();
  if (profileError) throw profileError;
  const workStart = clockMinutes(profile?.working_start, 540);
  const workEnd = clockMinutes(profile?.working_end, 1020);
  const workdayMinutes = Math.max(0, workEnd - workStart);
  const grouped = new Map<string, { count: number; intervals: [number, number][]; classMinutes: number; studyMinutes: number; workMinutes: number; personalMinutes: number }>();

  for (const event of events) {
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    const declined = event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined");
    if (!start || !end || event.status === "cancelled" || event.transparency === "transparent" || ["workingLocation", "focusTime", "outOfOffice", "birthday"].includes(event.eventType ?? "") || declined) continue;
    const date = start.slice(0, 10);
    const startMatch = start.match(/T(\d{2}):(\d{2})/);
    const endMatch = end.match(/T(\d{2}):(\d{2})/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startMatch || !endMatch) continue;
    const startMinute = Number(startMatch[1]) * 60 + Number(startMatch[2]);
    const endMinute = end.slice(0, 10) === date ? Number(endMatch[1]) * 60 + Number(endMatch[2]) : 1440;
    const bucket = grouped.get(date) ?? { count: 0, intervals: [], classMinutes: 0, studyMinutes: 0, workMinutes: 0, personalMinutes: 0 };
    bucket.count += 1;
    bucket.intervals.push([startMinute, Math.max(startMinute, endMinute)]);
    const duration = Math.min(1440, Math.max(0, endMinute - startMinute));
    const category = calendarCategory(event.summary ?? "", event.attendees?.length ?? 0);
    if (category === "class") bucket.classMinutes += duration;
    else if (category === "study") bucket.studyMinutes += duration;
    else if (category === "work") bucket.workMinutes += duration;
    else if (category === "personal") bucket.personalMinutes += duration;
    grouped.set(date, bucket);
  }

  const syncedAt = new Date().toISOString();
  const summaries = [...grouped].map(([summaryDate, bucket]) => {
    const meetingMinutes = Math.min(1440, unionMinutes(bucket.intervals));
    const busyAtWork = unionMinutes(bucket.intervals.map(([start, end]) => [Math.max(start, workStart), Math.min(end, workEnd)]));
    const firstEventMinute = bucket.intervals.length ? Math.min(...bucket.intervals.map(([start]) => start)) : null;
    const lastEventMinute = bucket.intervals.length ? Math.max(...bucket.intervals.map(([, end]) => end)) : null;
    return {
      user_id: context.user.userId,
      summary_date: summaryDate,
      meeting_count: Math.min(500, bucket.count),
      meeting_minutes: meetingMinutes,
      focus_minutes: Math.max(0, workdayMinutes - busyAtWork),
      class_minutes: Math.min(1440, bucket.classMinutes),
      study_minutes: Math.min(1440, bucket.studyMinutes),
      work_minutes: Math.min(1440, bucket.workMinutes),
      personal_minutes: Math.min(1440, bucket.personalMinutes),
      longest_open_minutes: Math.min(1440, longestOpenMinutes(bucket.intervals, workStart, workEnd)),
      first_event_minute: firstEventMinute,
      last_event_minute: lastEventMinute,
      synced_at: syncedAt,
    };
  });

  const { error: deleteError } = await context.supabase.from("daymark_calendar_summaries").delete().eq("user_id", context.user.userId).gte("summary_date", timeMin.slice(0, 10)).lte("summary_date", timeMax.slice(0, 10));
  if (deleteError) throw deleteError;
  if (summaries.length) {
    const { error } = await context.supabase.from("daymark_calendar_summaries").upsert(summaries, { onConflict: "user_id,summary_date" });
    if (error) throw error;
  }
  const { error: connectError } = await context.supabase.from("daymark_users").update({ calendar_connected: true, updated_at: syncedAt }).eq("user_id", context.user.userId);
  if (connectError) throw connectError;
}

async function userData({ user, supabase }: RequestContext) {
  const historyStart = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const [profileResult, checkinsResult, prioritiesResult, priorityHistoryResult, calendarResult] = await Promise.all([
    supabase.from("daymark_users").select("*").eq("user_id", user.userId).maybeSingle(),
    supabase.from("daymark_checkins").select("*").eq("user_id", user.userId).gte("entry_date", historyStart).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(400),
    supabase.from("daymark_priorities").select("*").eq("user_id", user.userId).eq("priority_date", today()).order("sort_order").order("id"),
    supabase.from("daymark_priorities").select("priority_date,completed").eq("user_id", user.userId).gte("priority_date", historyStart).order("priority_date", { ascending: false }).limit(1000),
    supabase.from("daymark_calendar_summaries").select("summary_date,meeting_count,meeting_minutes,focus_minutes,class_minutes,study_minutes,work_minutes,personal_minutes,longest_open_minutes,first_event_minute,last_event_minute,synced_at").eq("user_id", user.userId).gte("summary_date", historyStart).order("summary_date", { ascending: false }).limit(200),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (checkinsResult.error) throw checkinsResult.error;
  if (prioritiesResult.error) throw prioritiesResult.error;
  if (priorityHistoryResult.error) throw priorityHistoryResult.error;
  if (calendarResult.error) throw calendarResult.error;

  const profile = mapProfile(profileResult.data as DatabaseRecord | null);
  const checkins = (checkinsResult.data as DatabaseRecord[]).map(mapCheckin);
  const priorities = (prioritiesResult.data as DatabaseRecord[]).map(mapPriority);
  const latestMorning = checkins.find((entry) => entry.entryType === "morning") ?? null;
  const prediction = buildPersonalForecast(checkins, latestMorning);
  return {
    user: { id: user.userId, email: user.email, displayName: profile?.displayName ?? user.displayName },
    profile,
    checkins,
    latestMorning,
    priorities,
    priorityHistory: (priorityHistoryResult.data as DatabaseRecord[]).map((row) => ({ priorityDate: String(row.priority_date), completed: Boolean(row.completed) })),
    calendarSummaries: (calendarResult.data as DatabaseRecord[]).map(mapCalendarSummary),
    forecast: prediction.forecast,
    forecastModel: prediction.model,
    baselineDays: new Set(checkins.filter((entry) => entry.entryType === "morning").map((entry) => entry.entryDate)).size,
  };
}

function unauthorized() {
  return jsonResponse({ error: "Sign in with Daymark to save personal data." }, 401);
}

export async function GET(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    const rateLimited = await enforceRateLimit(context);
    if (rateLimited) return rateLimited;
    await bootstrapUser(context);
    return jsonResponse(await userData(context));
  } catch (error) {
    console.error("[daymark] failed to load user data", error);
    return jsonResponse({ error: "Your Daymark data could not be loaded." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    const rateLimited = await enforceRateLimit(context);
    if (rateLimited) return rateLimited;
    const parsedPayload = await readPayload(request);
    if (parsedPayload.response) return parsedPayload.response;
    await bootstrapUser(context);
    const { user, supabase } = context;
    const payload = parsedPayload.data!;
    const action = String(payload.action ?? "");

    if (action === "checkin.save") {
      const entryType = payload.entryType === "evening" ? "evening" : "morning";
      const energy = boundedNumber(payload.energy, 4, 1, 5);
      const stress = boundedNumber(payload.stress, 2, 1, 5);
      const focus = boundedNumber(payload.focusMinutes, 120, 0, 240);
      const sleep = boundedNumber(payload.sleepMinutes, 462, 0, 900);
      const workload = ["light", "normal", "heavy"].includes(String(payload.workload)) ? String(payload.workload) : "normal";
      const values = {
        user_id: user.userId,
        entry_date: today(),
        entry_type: entryType,
        energy: entryType === "morning" ? energy : null,
        stress: entryType === "morning" ? stress : null,
        sleep_minutes: entryType === "morning" ? sleep : null,
        workload: entryType === "morning" ? workload : null,
        planned_focus_minutes: entryType === "morning" ? focus : null,
        productivity: entryType === "evening" ? boundedNumber(payload.productivity, 8, 0, 10) : null,
        focused_minutes: entryType === "evening" ? focus : null,
        reflection: entryType === "evening" ? String(payload.reflection ?? "").slice(0, 1200) : null,
        prediction: null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("daymark_checkins").upsert(values, { onConflict: "user_id,entry_date,entry_type" });
      if (error) throw error;
    } else if (action === "priority.create") {
      const title = String(payload.title ?? "").trim().slice(0, 180);
      if (!title) return jsonResponse({ error: "Priority title is required." }, 400);
      const { error } = await supabase.from("daymark_priorities").insert({
        user_id: user.userId,
        priority_date: today(),
        title,
        impact: String(payload.impact ?? "MEDIUM IMPACT").slice(0, 40),
      });
      if (error) throw error;
    } else if (action === "priority.toggle") {
      const id = Number(payload.id);
      if (!Number.isSafeInteger(id) || id <= 0) return jsonResponse({ error: "Valid priority id is required." }, 400);
      const { error } = await supabase.from("daymark_priorities").update({ completed: Boolean(payload.completed) }).eq("id", id).eq("user_id", user.userId);
      if (error) throw error;
    } else if (action === "profile.update") {
      const displayName = String(payload.displayName ?? "").trim().slice(0, 80) || user.displayName;
      const goal = String(payload.goal ?? "Improve daily focus").trim().slice(0, 120);
      const { error } = await supabase.from("daymark_users").update({ display_name: displayName, goal, updated_at: new Date().toISOString() }).eq("user_id", user.userId);
      if (error) throw error;
    } else if (action === "calendar.sync") {
      await syncGoogleCalendar(context, String(payload.providerToken ?? ""), String(payload.timeZone ?? "UTC"));
    } else if (action === "calendar.disconnect") {
      const { error: summaryError } = await supabase.from("daymark_calendar_summaries").delete().eq("user_id", user.userId);
      if (summaryError) throw summaryError;
      const { error } = await supabase.from("daymark_users").update({ calendar_connected: false, updated_at: new Date().toISOString() }).eq("user_id", user.userId);
      if (error) throw error;
    } else {
      return jsonResponse({ error: "Unsupported action." }, 400);
    }

    return jsonResponse(await userData(context));
  } catch (error) {
    if (error instanceof Error && error.message === "GOOGLE_CALENDAR_PERMISSION") return jsonResponse({ error: "Google Calendar access expired or was not granted. Please reconnect it." }, 400);
    if (error instanceof Error && error.message === "INVALID_GOOGLE_TOKEN") return jsonResponse({ error: "Google Calendar could not be connected. Please try again." }, 400);
    if (error instanceof Error && error.message === "INVALID_TIME_ZONE") return jsonResponse({ error: "Your device time zone is not supported." }, 400);
    if (error instanceof Error && error.message === "GOOGLE_CALENDAR_UNAVAILABLE") return jsonResponse({ error: "Google Calendar is temporarily unavailable." }, 502);
    console.error("[daymark] failed to save user data", error);
    return jsonResponse({ error: "Your changes could not be saved." }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    const rateLimited = await enforceRateLimit(context);
    if (rateLimited) return rateLimited;
    const { error } = await context.supabase.from("daymark_users").delete().eq("user_id", context.user.userId);
    if (error) throw error;
    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error("[daymark] failed to delete user data", error);
    return jsonResponse({ error: "Your data could not be deleted." }, 500);
  }
}

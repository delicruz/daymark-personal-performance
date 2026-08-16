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

async function userData({ user, supabase }: RequestContext) {
  const [profileResult, checkinsResult, prioritiesResult] = await Promise.all([
    supabase.from("daymark_users").select("*").eq("user_id", user.userId).maybeSingle(),
    supabase.from("daymark_checkins").select("*").eq("user_id", user.userId).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    supabase.from("daymark_priorities").select("*").eq("user_id", user.userId).eq("priority_date", today()).order("sort_order").order("id"),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (checkinsResult.error) throw checkinsResult.error;
  if (prioritiesResult.error) throw prioritiesResult.error;

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
    } else if (action === "calendar.toggle") {
      const { error } = await supabase.from("daymark_users").update({ calendar_connected: Boolean(payload.connected), updated_at: new Date().toISOString() }).eq("user_id", user.userId);
      if (error) throw error;
    } else {
      return jsonResponse({ error: "Unsupported action." }, 400);
    }

    return jsonResponse(await userData(context));
  } catch (error) {
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

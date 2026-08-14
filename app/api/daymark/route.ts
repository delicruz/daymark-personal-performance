import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildPersonalForecast } from "../../../lib/prediction";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type AuthenticatedUser = { userId: string; email: string; displayName: string };
type RequestContext = { user: AuthenticatedUser; supabase: SupabaseClient };
type DatabaseRecord = Record<string, unknown>;

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
  return Response.json({ error: "Sign in with Daymark to save personal data." }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    await bootstrapUser(context);
    return Response.json(await userData(context));
  } catch (error) {
    console.error("[daymark] failed to load user data", error);
    return Response.json({ error: "Your Daymark data could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    await bootstrapUser(context);
    const { user, supabase } = context;
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "checkin.save") {
      const entryType = payload.entryType === "evening" ? "evening" : "morning";
      const energy = clamp(Number(payload.energy ?? 4), 1, 5);
      const stress = clamp(Number(payload.stress ?? 2), 1, 5);
      const focus = clamp(Number(payload.focusMinutes ?? 120), 0, 240);
      const sleep = clamp(Number(payload.sleepMinutes ?? 462), 0, 900);
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
        productivity: entryType === "evening" ? clamp(Number(payload.productivity ?? 8), 0, 10) : null,
        focused_minutes: entryType === "evening" ? focus : null,
        reflection: entryType === "evening" ? String(payload.reflection ?? "").slice(0, 1200) : null,
        prediction: null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("daymark_checkins").upsert(values, { onConflict: "user_id,entry_date,entry_type" });
      if (error) throw error;
    } else if (action === "priority.create") {
      const title = String(payload.title ?? "").trim().slice(0, 180);
      if (!title) return Response.json({ error: "Priority title is required." }, { status: 400 });
      const { error } = await supabase.from("daymark_priorities").insert({
        user_id: user.userId,
        priority_date: today(),
        title,
        impact: String(payload.impact ?? "MEDIUM IMPACT").slice(0, 40),
      });
      if (error) throw error;
    } else if (action === "priority.toggle") {
      const id = Number(payload.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Valid priority id is required." }, { status: 400 });
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
      return Response.json({ error: "Unsupported action." }, { status: 400 });
    }

    return Response.json(await userData(context));
  } catch (error) {
    console.error("[daymark] failed to save user data", error);
    return Response.json({ error: "Your changes could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requestContext(request);
    if (!context) return unauthorized();
    const { error } = await context.supabase.from("daymark_users").delete().eq("user_id", context.user.userId);
    if (error) throw error;
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[daymark] failed to delete user data", error);
    return Response.json({ error: "Your data could not be deleted." }, { status: 500 });
  }
}

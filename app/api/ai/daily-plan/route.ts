import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { z } from "zod";
import { buildDailyCoachPrompt, type DailyCoachContext } from "../../../../lib/ai-daily-coach";
import { buildPersonalForecast, type PredictionRecord } from "../../../../lib/prediction";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
const MAX_REQUEST_BYTES = 2_048;
const AI_REQUESTS_PER_MINUTE = 5;
const recentRequests = new Map<string, number[]>();

const requestSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  request: z.string().trim().min(3).max(500),
});

const planSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(320),
  actions: z.array(z.object({
    title: z.string().min(1).max(100),
    timing: z.string().min(1).max(80),
    durationMinutes: z.number().int().min(5).max(180),
    effort: z.enum(["light", "moderate", "deep"]),
    reason: z.string().min(1).max(260),
  })).length(3),
  adjustment: z.string().min(1).max(260),
  evidenceNote: z.string().min(1).max(260),
});

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

async function authenticatedClient(request: Request): Promise<{ userId: string; supabase: SupabaseClient } | null> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) return null;
  const { url, publishableKey } = environment();
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { userId: data.user.id, supabase };
}

function allowLocalBurst(userId: string) {
  const now = Date.now();
  const recent = (recentRequests.get(userId) ?? []).filter((timestamp) => timestamp > now - 60_000);
  if (recent.length >= AI_REQUESTS_PER_MINUTE) return false;
  recent.push(now);
  recentRequests.set(userId, recent);
  if (recentRequests.size > 2_000) recentRequests.clear();
  return true;
}

async function consumePersistentLimit(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("daymark_consume_ai_rate_limit");
  if (error) return { available: false, allowed: false, retryAfter: 10 };
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after_seconds?: number } | null;
  return { available: true, allowed: Boolean(row?.allowed), retryAfter: Math.max(1, Number(row?.retry_after_seconds ?? 60)) };
}

async function safetyIdentifier(userId: string) {
  const bytes = new TextEncoder().encode(`daymark:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mapCheckin(row: Record<string, unknown>): PredictionRecord {
  return {
    entryDate: String(row.entry_date),
    entryType: row.entry_type === "evening" ? "evening" : "morning",
    energy: row.energy == null ? null : Number(row.energy),
    stress: row.stress == null ? null : Number(row.stress),
    sleepMinutes: row.sleep_minutes == null ? null : Number(row.sleep_minutes),
    workload: row.workload == null ? null : String(row.workload),
    plannedFocusMinutes: row.planned_focus_minutes == null ? null : Number(row.planned_focus_minutes),
    productivity: row.productivity == null ? null : Number(row.productivity),
  };
}

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return jsonResponse({ error: "Request is too large." }, 413);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return jsonResponse({ error: "Content-Type must be application/json." }, 415);

    const auth = await authenticatedClient(request);
    if (!auth) return jsonResponse({ error: "Sign in to create a private AI plan." }, 401);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return jsonResponse({ error: "Request is too large." }, 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { return jsonResponse({ error: "Request must be valid JSON." }, 400); }
    const parsed = requestSchema.safeParse(decoded);
    if (!parsed.success) return jsonResponse({ error: "Describe what you want to adjust in 3–500 characters." }, 400);
    const apiKey = process.env.OPENAI_API_KEY?.trim() || process.env.OPEN_API_KEY?.trim();
    if (!apiKey) return jsonResponse({ error: "AI planning is not configured yet." }, 503);
    const openai = createOpenAI({ apiKey });

    const persistentLimit = await consumePersistentLimit(auth.supabase);
    if (!persistentLimit.available) return jsonResponse({ error: "Planning is temporarily unavailable." }, 503, { "Retry-After": String(persistentLimit.retryAfter) });
    if (!persistentLimit.allowed || !allowLocalBurst(auth.userId)) return jsonResponse({ error: "You have created several plans. Wait a minute before trying again." }, 429, { "Retry-After": String(persistentLimit.retryAfter) });

    const historyStart = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    const [profileResult, checkinsResult, prioritiesResult, calendarResult] = await Promise.all([
      auth.supabase.from("daymark_users").select("goal").eq("user_id", auth.userId).maybeSingle(),
      auth.supabase.from("daymark_checkins").select("entry_date,entry_type,energy,stress,sleep_minutes,workload,planned_focus_minutes,productivity").eq("user_id", auth.userId).gte("entry_date", historyStart).order("entry_date", { ascending: false }).limit(400),
      auth.supabase.from("daymark_priorities").select("title,completed").eq("user_id", auth.userId).eq("priority_date", parsed.data.localDate).order("sort_order").limit(10),
      auth.supabase.from("daymark_calendar_summaries").select("meeting_minutes,focus_minutes,class_minutes,study_minutes,work_minutes,longest_open_minutes,longest_open_start_minute,longest_open_end_minute").eq("user_id", auth.userId).eq("summary_date", parsed.data.localDate).maybeSingle(),
    ]);
    const databaseError = profileResult.error ?? checkinsResult.error ?? prioritiesResult.error ?? calendarResult.error;
    if (databaseError) throw databaseError;

    const checkins = (checkinsResult.data ?? []).map((row) => mapCheckin(row as Record<string, unknown>));
    const morning = checkins.find((entry) => entry.entryDate === parsed.data.localDate && entry.entryType === "morning") ?? null;
    const prediction = buildPersonalForecast(checkins, morning);
    const priority = prioritiesResult.data?.find((item) => !item.completed)?.title ?? null;
    const calendar = calendarResult.data;
    const context: DailyCoachContext = {
      localDate: parsed.data.localDate,
      request: parsed.data.request,
      goal: profileResult.data?.goal ?? "Improve daily focus",
      forecast: prediction.forecast,
      rangeLow: prediction.model.rangeLow,
      rangeHigh: prediction.model.rangeHigh,
      modelStatus: prediction.model.status,
      energy: morning?.energy ?? null,
      stress: morning?.stress ?? null,
      sleepMinutes: morning?.sleepMinutes ?? null,
      plannedFocusMinutes: morning?.plannedFocusMinutes ?? null,
      workload: morning?.workload ?? null,
      priority,
      calendar: calendar ? {
        classMinutes: Number(calendar.class_minutes ?? 0),
        studyMinutes: Number(calendar.study_minutes ?? 0),
        workMinutes: Number(calendar.work_minutes ?? 0),
        scheduledMinutes: Number(calendar.meeting_minutes ?? 0),
        openMinutes: Number(calendar.focus_minutes ?? 0),
        longestOpenMinutes: Number(calendar.longest_open_minutes ?? 0),
        longestOpenStartMinute: calendar.longest_open_start_minute == null ? null : Number(calendar.longest_open_start_minute),
        longestOpenEndMinute: calendar.longest_open_end_minute == null ? null : Number(calendar.longest_open_end_minute),
      } : null,
    };

    const result = await generateText({
      model: openai.responses(MODEL),
      instructions: "You are Daymark's private daily planning coach. Produce evidence-grounded planning suggestions, not medical, psychological, employment, or diagnostic advice. Never reveal hidden reasoning. Follow the structured output schema exactly.",
      output: Output.object({ name: "DaymarkDailyPlan", schema: planSchema }),
      prompt: buildDailyCoachPrompt(context),
      providerOptions: {
        openai: {
          store: false,
          reasoningEffort: "low",
          textVerbosity: "low",
          safetyIdentifier: await safetyIdentifier(auth.userId),
        } satisfies OpenAILanguageModelResponsesOptions,
      },
      abortSignal: AbortSignal.timeout(20_000),
    });

    return jsonResponse({ ...result.output, source: "ai", generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[daymark-ai] daily plan failed", error instanceof Error ? error.message : "Unknown error");
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      return jsonResponse({ error: "The AI service is busy or its usage limit has been reached. Please try again shortly." }, 429, { "Retry-After": "30" });
    }
    return jsonResponse({ error: "The AI coach could not create a plan right now. Please try again shortly." }, 503, { "Retry-After": "10" });
  }
}

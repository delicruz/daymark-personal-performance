import { and, asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser, chatGPTSignInPath, type ChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { ensureDaymarkSchema } from "../../../db/daymark";
import { checkins, priorities, users } from "../../../db/schema";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function requestUser(allowLocalDemo = true): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (user) return user;
  if (allowLocalDemo && process.env.NODE_ENV === "development") {
    return { userId: "local-daymark-user", email: "local@daymark.test", displayName: "Local user", fullName: "Local user" };
  }
  return null;
}

async function bootstrapUser(user: ChatGPTUser) {
  const db = getDb();
  await db.insert(users).values({ id: user.userId, email: user.email, displayName: user.displayName }).onConflictDoUpdate({
    target: users.id,
    set: { email: user.email, displayName: user.displayName, updatedAt: new Date().toISOString() },
  });
}

async function userData(user: ChatGPTUser) {
  const db = getDb();
  const date = today();
  const [profile] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  const recentCheckins = await db.select().from(checkins).where(eq(checkins.userId, user.userId)).orderBy(desc(checkins.entryDate), desc(checkins.createdAt)).limit(60);
  const todaysPriorities = await db.select().from(priorities).where(and(eq(priorities.userId, user.userId), eq(priorities.priorityDate, date))).orderBy(asc(priorities.sortOrder), asc(priorities.id));
  const latestMorning = recentCheckins.find((entry) => entry.entryType === "morning") ?? null;
  const forecast = latestMorning?.prediction ?? 74;
  return { user: { id: user.userId, email: user.email, displayName: profile?.displayName ?? user.displayName }, profile, checkins: recentCheckins, latestMorning, priorities: todaysPriorities, forecast, baselineDays: new Set(recentCheckins.filter((entry) => entry.entryType === "morning").map((entry) => entry.entryDate)).size };
}

function unauthorized() {
  return Response.json({ error: "Sign in is required to save personal data.", signInPath: chatGPTSignInPath("/") }, { status: 401 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await requestUser(url.searchParams.get("session") !== "1");
  if (!user) return unauthorized();
  try {
    await ensureDaymarkSchema();
    await bootstrapUser(user);
    return Response.json(await userData(user));
  } catch (error) {
    console.error("[daymark] failed to load user data", error);
    return Response.json({ error: "Your Daymark data could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requestUser();
  if (!user) return unauthorized();
  try {
    await ensureDaymarkSchema();
    await bootstrapUser(user);
    const db = getDb();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "checkin.save") {
      const entryType = payload.entryType === "evening" ? "evening" : "morning";
      const energy = clamp(Number(payload.energy ?? 4), 1, 5);
      const stress = clamp(Number(payload.stress ?? 2), 1, 5);
      const focus = clamp(Number(payload.focusMinutes ?? 120), 0, 240);
      const sleep = clamp(Number(payload.sleepMinutes ?? 462), 0, 900);
      const workload = ["light", "normal", "heavy"].includes(String(payload.workload)) ? String(payload.workload) as "light" | "normal" | "heavy" : "normal";
      const workloadAdjustment = workload === "light" ? 3 : workload === "heavy" ? -5 : 0;
      const sleepAdjustment = clamp(Math.round((sleep - 420) / 30), -6, 6);
      const prediction = clamp(64 + energy * 4 - stress * 2 + Math.round(focus / 60) + sleepAdjustment + workloadAdjustment, 35, 92);
      const values = {
        userId: user.userId,
        entryDate: today(),
        entryType,
        energy: entryType === "morning" ? energy : null,
        stress: entryType === "morning" ? stress : null,
        sleepMinutes: entryType === "morning" ? sleep : null,
        workload: entryType === "morning" ? workload : null,
        plannedFocusMinutes: entryType === "morning" ? focus : null,
        productivity: entryType === "evening" ? clamp(Number(payload.productivity ?? 8), 1, 10) : null,
        focusedMinutes: entryType === "evening" ? focus : null,
        reflection: entryType === "evening" ? String(payload.reflection ?? "").slice(0, 1200) : null,
        prediction: entryType === "morning" ? prediction : null,
        updatedAt: new Date().toISOString(),
      };
      await db.insert(checkins).values(values).onConflictDoUpdate({
        target: [checkins.userId, checkins.entryDate, checkins.entryType],
        set: values,
      });
    } else if (action === "priority.create") {
      const title = String(payload.title ?? "").trim().slice(0, 180);
      if (!title) return Response.json({ error: "Priority title is required." }, { status: 400 });
      await db.insert(priorities).values({ userId: user.userId, priorityDate: today(), title, impact: String(payload.impact ?? "MEDIUM IMPACT").slice(0, 40) });
    } else if (action === "priority.toggle") {
      const id = Number(payload.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Valid priority id is required." }, { status: 400 });
      await db.update(priorities).set({ completed: Boolean(payload.completed) }).where(and(eq(priorities.id, id), eq(priorities.userId, user.userId)));
    } else if (action === "profile.update") {
      const displayName = String(payload.displayName ?? "").trim().slice(0, 80) || user.displayName;
      const goal = String(payload.goal ?? "Improve daily focus").trim().slice(0, 120);
      await db.update(users).set({ displayName, goal, updatedAt: new Date().toISOString() }).where(eq(users.id, user.userId));
    } else if (action === "calendar.toggle") {
      await db.update(users).set({ calendarConnected: Boolean(payload.connected), updatedAt: new Date().toISOString() }).where(eq(users.id, user.userId));
    } else {
      return Response.json({ error: "Unsupported action." }, { status: 400 });
    }

    return Response.json(await userData(user));
  } catch (error) {
    console.error("[daymark] failed to save user data", error);
    return Response.json({ error: "Your changes could not be saved." }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await requestUser();
  if (!user) return unauthorized();
  try {
    await ensureDaymarkSchema();
    const db = getDb();
    await db.delete(checkins).where(eq(checkins.userId, user.userId));
    await db.delete(priorities).where(eq(priorities.userId, user.userId));
    await db.delete(users).where(eq(users.id, user.userId));
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[daymark] failed to delete user data", error);
    return Response.json({ error: "Your data could not be deleted." }, { status: 500 });
  }
}

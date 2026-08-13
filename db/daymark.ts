import { env } from "cloudflare:workers";

export async function ensureDaymarkSchema() {
  const d1 = env.DB;
  if (!d1) throw new Error("Cloudflare D1 binding `DB` is unavailable.");

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT 'Improve daily focus',
      working_start TEXT NOT NULL DEFAULT '09:00',
      working_end TEXT NOT NULL DEFAULT '17:00',
      working_days TEXT NOT NULL DEFAULT 'weekdays',
      calendar_connected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      energy INTEGER,
      stress INTEGER,
      sleep_minutes INTEGER,
      workload TEXT,
      planned_focus_minutes INTEGER,
      productivity INTEGER,
      focused_minutes INTEGER,
      reflection TEXT,
      prediction INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS priorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      priority_date TEXT NOT NULL,
      title TEXT NOT NULL,
      impact TEXT NOT NULL DEFAULT 'MEDIUM IMPACT',
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_date_type ON checkins(user_id, entry_date, entry_type)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, entry_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_priorities_user_date ON priorities(user_id, priority_date)"),
  ]);

  await d1.prepare("PRAGMA optimize").run();
}

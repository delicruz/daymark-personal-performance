import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  goal: text("goal").notNull().default("Improve daily focus"),
  workingStart: text("working_start").notNull().default("09:00"),
  workingEnd: text("working_end").notNull().default("17:00"),
  workingDays: text("working_days").notNull().default("weekdays"),
  calendarConnected: integer("calendar_connected", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entryDate: text("entry_date").notNull(),
  entryType: text("entry_type", { enum: ["morning", "evening"] }).notNull(),
  energy: integer("energy"),
  stress: integer("stress"),
  sleepMinutes: integer("sleep_minutes"),
  workload: text("workload", { enum: ["light", "normal", "heavy"] }),
  plannedFocusMinutes: integer("planned_focus_minutes"),
  productivity: integer("productivity"),
  focusedMinutes: integer("focused_minutes"),
  reflection: text("reflection"),
  prediction: integer("prediction"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_checkins_user_date_type").on(table.userId, table.entryDate, table.entryType),
  index("idx_checkins_user_date").on(table.userId, table.entryDate),
]);

export const priorities = sqliteTable("priorities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  priorityDate: text("priority_date").notNull(),
  title: text("title").notNull(),
  impact: text("impact").notNull().default("MEDIUM IMPACT"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_priorities_user_date").on(table.userId, table.priorityDate)]);

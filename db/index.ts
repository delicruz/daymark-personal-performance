import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure a `DB` binding in the Cloudflare runtime before using the optional D1 database."
    );
  }

  return drizzle(env.DB, { schema });
}

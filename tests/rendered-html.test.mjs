import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Daymark landing experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Daymark/);
  assert.match(html, /Know your capacity/);
  assert.match(html, /Explore the live demo/);
  assert.match(html, /Sign in/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps persistent records scoped to an authenticated user", async () => {
  const [route, auth, migration] = await Promise.all([
    readFile(new URL("../app/api/daymark/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814015817_daymark_portable_storage.sql", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(auth, /authorization/);
  assert.match(route, /supabase\.auth\.getUser\(accessToken\)/);
  assert.match(route, /global: \{ headers: \{ Authorization/);
  assert.match(route, /from\("daymark_checkins"\).*\.eq\("user_id", user\.userId\)/s);
  assert.match(route, /from\("daymark_priorities"\).*\.eq\("user_id", user\.userId\)/s);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/g);
  assert.match(migration, /revoke all on table public\.daymark_users from anon/);
});

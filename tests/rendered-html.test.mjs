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

test("keeps persistent records scoped to an authenticated and rate-limited user", async () => {
  const [route, auth, migration, hardening, rateFix, rateRls, ratePolicy, model, config] = await Promise.all([
    readFile(new URL("../app/api/daymark/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814015817_daymark_portable_storage.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260816125924_daymark_security_hardening.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260816130113_fix_daymark_rate_limiter.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260816130317_harden_rate_limiter_rls.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260816130401_optimize_rate_limiter_policy.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/prediction.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
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
  assert.match(hardening, /force row level security/g);
  assert.match(hardening, /daymark_consume_rate_limit/);
  assert.match(hardening, /revoke all privileges on table public\.daymark_rate_limits/);
  assert.match(rateFix, /v_now timestamptz/);
  assert.match(rateRls, /security invoker/);
  assert.match(rateRls, /app\.daymark_rate_limiter/);
  assert.match(ratePolicy, /select current_setting/);
  assert.match(route, /MAX_REQUEST_BYTES/);
  assert.match(route, /supabase\.rpc\("daymark_consume_rate_limit"\)/);
  assert.match(route, /Too many requests/);
  assert.match(route, /private, no-store/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /X-Frame-Options/);
  assert.match(model, /Personalized ridge regression/);
  assert.match(model, /for \(let index = MIN_PERSONALIZED_DAYS; index < samples\.length/);
  assert.doesNotMatch(route, /64 \+ energy \* 4/);
});

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
  const [route, schema, auth, hosting] = await Promise.all([
    readFile(new URL("../app/api/daymark/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.match(auth, /oai-authenticated-user-id/);
  assert.match(route, /getChatGPTUser/);
  assert.match(route, /eq\(checkins\.userId, user\.userId\)/);
  assert.match(route, /eq\(priorities\.userId, user\.userId\)/);
  assert.match(schema, /idx_checkins_user_date_type/);
  assert.match(schema, /idx_priorities_user_date/);
});

# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `vite.config.ts` provides the local vinext and Cloudflare build configuration
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example that requires separate runtime configuration
- `drizzle.config.ts` supports local migration generation when needed

## Supabase Auth

Daymark uses Supabase Auth for confirmed email-and-password accounts, password
reset/recovery, passwordless email links, and Google sign-in. New passwords must
be at least 12 characters and include uppercase, lowercase, numeric, and symbol
characters. Passwords are hashed and managed by Supabase rather than stored in
the Daymark application. Copy
`.env.example` to `.env.local` and provide the project URL and publishable key.
The browser stores the Supabase session and sends its access token with private
Daymark API requests. The API verifies every token with Supabase before querying
Postgres, and RLS keeps every record scoped to the verified Supabase user ID.
The API also applies a durable per-user request limit, rejects oversized payloads,
and returns private data with no-store cache headers. Database operations use
the Supabase query builder with fixed table, column, and RPC names, so user input
is transmitted as values rather than interpolated into raw SQL.

In the Supabase dashboard, add the local and production origins to
Authentication → URL Configuration. Enable Google under Authentication →
Providers and add the OAuth client credentials before using Google sign-in.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

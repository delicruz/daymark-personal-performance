# Daymark Personal Performance

Daymark is a personal performance dashboard that combines daily check-ins,
calendar commitments, outcome tracking, and an AI daily coach.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

Create `.env.local` from `.env.example`, then add the required Supabase and
OpenAI configuration.

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

## AI Daily Coach

The signed-in Today page can generate a private, three-step plan from the
user's request and summarized Daymark signals. Add `OPENAI_API_KEY` as a
server-only environment variable. `OPENAI_MODEL` is optional and defaults to
`gpt-5.6-luna`. The endpoint uses the OpenAI Responses API with structured
output, disables response storage, excludes raw calendar event text, and sends
a one-way identifier instead of a user ID. A dedicated Supabase limiter allows
five AI plans per signed-in user per minute.

Never prefix `OPENAI_API_KEY` with `NEXT_PUBLIC_`; doing so would expose the
secret to browser code. After changing either AI variable in Vercel, redeploy
the affected environment.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: create a production Next.js build
- `npm test`: build Daymark and run the model, calendar, insight, and UI tests

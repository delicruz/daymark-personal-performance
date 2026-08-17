create table if not exists public.daymark_calendar_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,
  meeting_count integer not null default 0 check (meeting_count between 0 and 500),
  meeting_minutes integer not null default 0 check (meeting_minutes between 0 and 1440),
  focus_minutes integer not null default 0 check (focus_minutes between 0 and 1440),
  synced_at timestamptz not null default now(),
  primary key (user_id, summary_date)
);

alter table public.daymark_calendar_summaries enable row level security;
alter table public.daymark_calendar_summaries force row level security;

revoke all on table public.daymark_calendar_summaries from anon;
revoke all on table public.daymark_calendar_summaries from service_role;
grant select, insert, update, delete on table public.daymark_calendar_summaries to authenticated;

create policy "calendar summaries are private to their owner"
on public.daymark_calendar_summaries
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists daymark_calendar_summaries_user_date_idx
on public.daymark_calendar_summaries (user_id, summary_date desc);

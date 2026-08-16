-- Reduce the Data API surface to the exact privileges Daymark uses.
revoke all privileges on table public.daymark_users from anon, service_role;
revoke all privileges on table public.daymark_checkins from anon, service_role;
revoke all privileges on table public.daymark_priorities from anon, service_role;

revoke all privileges on table public.daymark_users from authenticated;
revoke all privileges on table public.daymark_checkins from authenticated;
revoke all privileges on table public.daymark_priorities from authenticated;

grant select, insert, update, delete on table public.daymark_users to authenticated;
grant select, insert, update, delete on table public.daymark_checkins to authenticated;
grant select, insert, update, delete on table public.daymark_priorities to authenticated;

revoke all privileges on sequence public.daymark_checkins_id_seq from public, anon, authenticated, service_role;
revoke all privileges on sequence public.daymark_priorities_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.daymark_checkins_id_seq to authenticated;
grant usage, select on sequence public.daymark_priorities_id_seq to authenticated;

-- Make accidental future Data API exposure opt-in instead of automatic.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Keep owner access subject to the same ownership policies where possible.
alter table public.daymark_users force row level security;
alter table public.daymark_checkins force row level security;
alter table public.daymark_priorities force row level security;

-- Mirror the API's input limits in Postgres so direct Data API calls cannot bypass them.
alter table public.daymark_users
  add constraint daymark_users_display_name_length check (char_length(display_name) between 1 and 80),
  add constraint daymark_users_email_length check (char_length(email) between 3 and 320),
  add constraint daymark_users_goal_length check (char_length(goal) between 1 and 120);

alter table public.daymark_checkins
  add constraint daymark_checkins_reflection_length check (reflection is null or char_length(reflection) <= 1200);

alter table public.daymark_priorities
  add constraint daymark_priorities_impact_length check (char_length(impact) between 1 and 40);

-- Atomic, per-user fixed-window limiter used by the application API.
create table public.daymark_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 100000)
);

alter table public.daymark_rate_limits enable row level security;
revoke all privileges on table public.daymark_rate_limits from public, anon, authenticated, service_role;

create or replace function public.daymark_consume_rate_limit()
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current_time timestamptz := clock_timestamp();
  current_count integer;
  current_window timestamptz;
  request_limit constant integer := 60;
  window_size constant interval := interval '1 minute';
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  insert into public.daymark_rate_limits as limits (user_id, window_started_at, request_count)
  values (caller_id, current_time, 1)
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at <= current_time - window_size then current_time
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at <= current_time - window_size then 1
          else limits.request_count + 1
        end
  returning limits.request_count, limits.window_started_at
  into current_count, current_window;

  allowed := current_count <= request_limit;
  remaining := greatest(0, request_limit - current_count);
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_window + window_size - current_time)))::integer)
  end;
  return next;
end;
$$;

revoke all privileges on function public.daymark_consume_rate_limit() from public, anon, service_role;
grant execute on function public.daymark_consume_rate_limit() to authenticated;

comment on function public.daymark_consume_rate_limit() is
  'Consumes one of 60 per-user Daymark API requests per minute. Requires auth.uid().';

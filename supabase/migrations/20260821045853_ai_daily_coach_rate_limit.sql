-- Isolate paid AI requests from Daymark's general API quota. The table is not
-- directly exposed; authenticated users can only consume their own fixed window
-- through the narrowly granted RPC below.
create table public.daymark_ai_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count between 1 and 100000)
);

alter table public.daymark_ai_rate_limits enable row level security;
revoke all privileges on table public.daymark_ai_rate_limits from public, anon, authenticated, service_role;

create or replace function public.daymark_consume_ai_rate_limit()
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_window_started_at timestamptz;
  request_limit constant integer := 5;
  v_window_size constant interval := interval '1 minute';
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  insert into public.daymark_ai_rate_limits as limits (user_id, window_started_at, request_count)
  values (caller_id, v_now, 1)
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at <= v_now - v_window_size then v_now
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at <= v_now - v_window_size then 1
          else limits.request_count + 1
        end
  returning limits.request_count, limits.window_started_at
  into v_count, v_window_started_at;

  allowed := v_count <= request_limit;
  remaining := greatest(0, request_limit - v_count);
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_window_started_at + v_window_size - v_now)))::integer)
  end;
  return next;
end;
$$;

revoke all privileges on function public.daymark_consume_ai_rate_limit() from public, anon, service_role;
grant execute on function public.daymark_consume_ai_rate_limit() to authenticated;

comment on function public.daymark_consume_ai_rate_limit() is
  'Consumes one of five per-user Daymark AI plan requests per minute. Requires auth.uid().';

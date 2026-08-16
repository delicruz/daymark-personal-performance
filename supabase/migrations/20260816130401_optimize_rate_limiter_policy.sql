drop policy "Rate limiter manages only the caller's bucket" on public.daymark_rate_limits;

create policy "Rate limiter manages only the caller's bucket"
on public.daymark_rate_limits for all to authenticated
using (
  (select auth.uid()) = user_id
  and (select current_setting('app.daymark_rate_limiter', true)) = '1'
)
with check (
  (select auth.uid()) = user_id
  and (select current_setting('app.daymark_rate_limiter', true)) = '1'
);

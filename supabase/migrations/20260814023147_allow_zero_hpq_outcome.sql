alter table public.daymark_checkins
  drop constraint daymark_checkins_productivity_check;

alter table public.daymark_checkins
  add constraint daymark_checkins_productivity_check
  check (productivity between 0 and 10);

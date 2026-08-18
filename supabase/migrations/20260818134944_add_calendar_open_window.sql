alter table public.daymark_calendar_summaries
  add column if not exists longest_open_start_minute integer check (longest_open_start_minute between 0 and 1440),
  add column if not exists longest_open_end_minute integer check (longest_open_end_minute between 0 and 1440);

comment on column public.daymark_calendar_summaries.longest_open_start_minute is
  'Local wall-clock start of the longest open block inside the user working day.';
comment on column public.daymark_calendar_summaries.longest_open_end_minute is
  'Local wall-clock end of the longest open block inside the user working day.';

alter table public.daymark_calendar_summaries
  add column if not exists class_minutes integer not null default 0 check (class_minutes between 0 and 1440),
  add column if not exists study_minutes integer not null default 0 check (study_minutes between 0 and 1440),
  add column if not exists work_minutes integer not null default 0 check (work_minutes between 0 and 1440),
  add column if not exists personal_minutes integer not null default 0 check (personal_minutes between 0 and 1440),
  add column if not exists longest_open_minutes integer not null default 0 check (longest_open_minutes between 0 and 1440),
  add column if not exists first_event_minute integer check (first_event_minute between 0 and 1440),
  add column if not exists last_event_minute integer check (last_event_minute between 0 and 1440);

comment on column public.daymark_calendar_summaries.class_minutes is
  'Aggregate duration of class-like events. Raw Google Calendar event text is not stored.';
comment on column public.daymark_calendar_summaries.study_minutes is
  'Aggregate duration of study-like events. Raw Google Calendar event text is not stored.';
comment on column public.daymark_calendar_summaries.work_minutes is
  'Aggregate duration of work-like events. Raw Google Calendar event text is not stored.';
comment on column public.daymark_calendar_summaries.personal_minutes is
  'Aggregate duration of uncategorised personal commitments. Raw Google Calendar event text is not stored.';

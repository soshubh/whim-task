-- =============================================================================
-- Whim Task — Normalized tables + realtime (final setup)
-- Run AFTER 03-drop-legacy-sync.sql
--
-- Uses separate tables (already created by initial schema):
--   profiles, notification_settings, routines, planner_days, planner_tasks,
--   reminders, pomodoro_timer_settings, pomodoro_sessions, daily_update_logs
-- =============================================================================

-- Ensure client string IDs (safe if already applied)
alter table public.planner_tasks
  drop constraint if exists planner_tasks_routine_id_fkey;

alter table public.reminders
  drop constraint if exists reminders_routine_id_fkey;

alter table public.routines
  alter column id drop default;

alter table public.routines
  alter column id type text using id::text;

alter table public.planner_tasks
  alter column routine_id type text using routine_id::text;

alter table public.reminders
  alter column routine_id type text using routine_id::text;

alter table public.planner_tasks
  add constraint planner_tasks_routine_id_fkey
  foreign key (routine_id) references public.routines (id) on delete set null;

alter table public.reminders
  add constraint reminders_routine_id_fkey
  foreign key (routine_id) references public.routines (id) on delete cascade;

alter table public.pomodoro_sessions
  alter column id drop default;

alter table public.pomodoro_sessions
  alter column id type text using id::text;

-- Realtime: full row data on UPDATE/DELETE
alter table public.routines replica identity full;
alter table public.planner_days replica identity full;
alter table public.planner_tasks replica identity full;
alter table public.reminders replica identity full;
alter table public.notification_settings replica identity full;
alter table public.pomodoro_timer_settings replica identity full;
alter table public.pomodoro_sessions replica identity full;
alter table public.daily_update_logs replica identity full;
alter table public.profiles replica identity full;

-- Add all app tables to Supabase Realtime publication
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'routines',
    'planner_days',
    'planner_tasks',
    'reminders',
    'notification_settings',
    'pomodoro_timer_settings',
    'pomodoro_sessions',
    'daily_update_logs',
    'profiles'
  ]
  loop
    begin
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- Grants (idempotent)
grant select, insert, update, delete on public.routines to authenticated;
grant select, insert, update, delete on public.planner_days to authenticated;
grant select, insert, update, delete on public.planner_tasks to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert, update, delete on public.notification_settings to authenticated;
grant select, insert, update, delete on public.pomodoro_timer_settings to authenticated;
grant select, insert, update, delete on public.pomodoro_sessions to authenticated;
grant select, insert, update, delete on public.daily_update_logs to authenticated;

-- Helpful indexes for sync queries
create index if not exists planner_tasks_user_id_idx
  on public.planner_tasks (user_id);

create index if not exists pomodoro_sessions_user_id_idx
  on public.pomodoro_sessions (user_id);

select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

-- =============================================================================
-- Whim Task — Schema fixes for client-generated string IDs
-- Run BEFORE 02-migrate-snapshot-to-tables.sql
-- =============================================================================

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

select 'schema fixes applied' as status;

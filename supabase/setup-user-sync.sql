-- =============================================================================
-- Whim Task — Cross-device sync setup (run once in Supabase SQL Editor)
-- =============================================================================
-- Syncs: tasks, routines, reminders, settings, pomodoro logs
-- Profile name/avatar uses the separate `profiles` table (already working).
--
-- Prerequisites: run initial schema first so `profiles` + `set_updated_at()` exist:
--   supabase/migrations/20250615000000_initial_schema.sql
-- =============================================================================

-- Helper (safe if already created by initial schema)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Main sync table — one row per user, JSON mirrors app localStorage
create table if not exists public.user_sync_snapshots (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  planner_state jsonb not null default '{}'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  app_settings jsonb not null default '{}'::jsonb,
  pomodoro_timer_defaults jsonb not null default '{"focus":1500,"short-break":300,"long-break":900}'::jsonb,
  pomodoro_sessions_by_date jsonb not null default '{}'::jsonb,
  daily_update_marker text,
  updated_at timestamptz not null default now()
);

-- Add column if table existed from an older migration
alter table public.user_sync_snapshots
add column if not exists app_settings jsonb not null default '{}'::jsonb;

drop trigger if exists user_sync_snapshots_set_updated_at on public.user_sync_snapshots;

create trigger user_sync_snapshots_set_updated_at
before update on public.user_sync_snapshots
for each row execute function public.set_updated_at();

-- Permissions
grant select, insert, update, delete on public.user_sync_snapshots to authenticated;
grant all on public.user_sync_snapshots to service_role;

-- Row Level Security
alter table public.user_sync_snapshots enable row level security;

drop policy if exists "user_sync_snapshots_select_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_insert_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_update_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_delete_own" on public.user_sync_snapshots;

create policy "user_sync_snapshots_select_own"
on public.user_sync_snapshots for select
to authenticated
using (user_id = auth.uid());

create policy "user_sync_snapshots_insert_own"
on public.user_sync_snapshots for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_sync_snapshots_update_own"
on public.user_sync_snapshots for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "user_sync_snapshots_delete_own"
on public.user_sync_snapshots for delete
to authenticated
using (user_id = auth.uid());

-- Realtime (live updates across phone + desktop)
alter table public.user_sync_snapshots replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.user_sync_snapshots;
exception
  when duplicate_object then null;
end $$;

-- Verify (should return 1 row describing the table)
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_sync_snapshots'
order by ordinal_position;

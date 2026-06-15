-- Whim Task — initial Supabase schema
-- Auth: Gmail OTP via Brevo (no Google OAuth provider)
-- Run in Supabase SQL Editor or via `supabase db push`

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.task_source as enum ('manual', 'routine', 'dump');
create type public.task_status as enum ('active', 'completed');
create type public.routine_frequency as enum ('daily', 'weekly', 'bi-weekly', 'monthly');
create type public.reminder_kind as enum ('task', 'routine');
create type public.reminder_status as enum ('scheduled', 'triggered', 'dismissed');
create type public.notification_sound as enum ('default', 'soft', 'bell', 'none');
create type public.daily_update_slot as enum ('morning', 'evening');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_valid_email(email_input text)
returns boolean
language sql
immutable
as $$
  select lower(trim(email_input)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  avatar_path text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email)),
  constraint profiles_email_valid check (public.is_valid_email(email)),
  constraint profiles_email_unique unique (email)
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notification settings
-- ---------------------------------------------------------------------------

create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  browser_notifications_enabled boolean not null default false,
  sound public.notification_sound not null default 'default',
  daily_update_enabled boolean not null default false,
  morning_enabled boolean not null default true,
  morning_time time not null default '08:00',
  evening_enabled boolean not null default true,
  evening_time time not null default '21:00',
  include_completed boolean not null default true,
  include_remaining boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_settings_set_updated_at
before update on public.notification_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  frequency public.routine_frequency not null default 'daily',
  week_days integer[] not null default '{}',
  month_dates integer[] not null default '{}',
  created_date_key date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routines_user_id_idx on public.routines (user_id);

create trigger routines_set_updated_at
before update on public.routines
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Planner days (per-day UI state)
-- ---------------------------------------------------------------------------

create table public.planner_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date_key date not null,
  draft text not null default '',
  is_adding boolean not null default false,
  show_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_days_user_date_unique unique (user_id, date_key)
);

create index planner_days_user_id_idx on public.planner_days (user_id);
create index planner_days_user_date_idx on public.planner_days (user_id, date_key);

create trigger planner_days_set_updated_at
before update on public.planner_days
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Planner tasks
-- ---------------------------------------------------------------------------

create table public.planner_tasks (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_id uuid not null references public.planner_days (id) on delete cascade,
  title text not null,
  source public.task_source not null default 'manual',
  routine_id uuid references public.routines (id) on delete set null,
  status public.task_status not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planner_tasks_user_id_idx on public.planner_tasks (user_id);
create index planner_tasks_day_id_idx on public.planner_tasks (day_id);
create index planner_tasks_day_status_sort_idx on public.planner_tasks (day_id, status, sort_order);

create trigger planner_tasks_set_updated_at
before update on public.planner_tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reminders (task + routine)
-- ---------------------------------------------------------------------------

create table public.reminders (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reminder_kind not null,
  status public.reminder_status not null default 'scheduled',
  title text not null,
  reminder_time time not null,
  date_key date,
  task_id text references public.planner_tasks (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete cascade,
  last_triggered_date_key date,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_task_shape check (
    kind <> 'task'
    or (task_id is not null and date_key is not null)
  ),
  constraint reminders_routine_shape check (
    kind <> 'routine'
    or routine_id is not null
  )
);

create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_user_status_idx on public.reminders (user_id, status);
create index reminders_scheduled_at_idx on public.reminders (scheduled_at);

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pomodoro timer defaults
-- ---------------------------------------------------------------------------

create table public.pomodoro_timer_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  focus_seconds integer not null default 1500 check (focus_seconds > 0),
  short_break_seconds integer not null default 300 check (short_break_seconds > 0),
  long_break_seconds integer not null default 900 check (long_break_seconds > 0),
  updated_at timestamptz not null default now()
);

create trigger pomodoro_timer_settings_set_updated_at
before update on public.pomodoro_timer_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pomodoro session logs
-- ---------------------------------------------------------------------------

create table public.pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date_key date not null,
  task_id text not null,
  task_title text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  created_at timestamptz not null default now()
);

create index pomodoro_sessions_user_date_idx on public.pomodoro_sessions (user_id, date_key desc);

-- ---------------------------------------------------------------------------
-- Daily update fire logs
-- ---------------------------------------------------------------------------

create table public.daily_update_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date_key date not null,
  slot public.daily_update_slot not null,
  fired_at timestamptz not null default now(),
  constraint daily_update_logs_unique_marker unique (user_id, date_key, slot)
);

create index daily_update_logs_user_date_idx on public.daily_update_logs (user_id, date_key desc);

-- ---------------------------------------------------------------------------
-- OTP codes (Brevo email flow — service role / edge functions only)
-- ---------------------------------------------------------------------------

create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint otp_codes_email_lowercase check (email = lower(email)),
  constraint otp_codes_email_valid check (public.is_valid_email(email))
);

create index otp_codes_email_created_idx on public.otp_codes (email, created_at desc);
create index otp_codes_expires_at_idx on public.otp_codes (expires_at);

-- ---------------------------------------------------------------------------
-- New user bootstrap (profile + defaults)
-- ---------------------------------------------------------------------------

create or replace function public.derive_name_from_email(email_input text)
returns text
language plpgsql
immutable
as $$
declare
  local_part text;
begin
  local_part := split_part(lower(trim(email_input)), '@', 1);
  local_part := regexp_replace(local_part, '[._+\-]+', ' ', 'g');

  return initcap(trim(both ' ' from local_part));
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
begin
  derived_name := public.derive_name_from_email(new.email);

  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), derived_name)
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now();

  insert into public.notification_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.pomodoro_timer_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.notification_settings enable row level security;
alter table public.routines enable row level security;
alter table public.planner_days enable row level security;
alter table public.planner_tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.pomodoro_timer_settings enable row level security;
alter table public.pomodoro_sessions enable row level security;
alter table public.daily_update_logs enable row level security;
alter table public.otp_codes enable row level security;

-- Profiles
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Notification settings
create policy "notification_settings_select_own"
on public.notification_settings for select
to authenticated
using (user_id = auth.uid());

create policy "notification_settings_insert_own"
on public.notification_settings for insert
to authenticated
with check (user_id = auth.uid());

create policy "notification_settings_update_own"
on public.notification_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Routines
create policy "routines_select_own"
on public.routines for select
to authenticated
using (user_id = auth.uid());

create policy "routines_insert_own"
on public.routines for insert
to authenticated
with check (user_id = auth.uid());

create policy "routines_update_own"
on public.routines for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "routines_delete_own"
on public.routines for delete
to authenticated
using (user_id = auth.uid());

-- Planner days
create policy "planner_days_select_own"
on public.planner_days for select
to authenticated
using (user_id = auth.uid());

create policy "planner_days_insert_own"
on public.planner_days for insert
to authenticated
with check (user_id = auth.uid());

create policy "planner_days_update_own"
on public.planner_days for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "planner_days_delete_own"
on public.planner_days for delete
to authenticated
using (user_id = auth.uid());

-- Planner tasks
create policy "planner_tasks_select_own"
on public.planner_tasks for select
to authenticated
using (user_id = auth.uid());

create policy "planner_tasks_insert_own"
on public.planner_tasks for insert
to authenticated
with check (user_id = auth.uid());

create policy "planner_tasks_update_own"
on public.planner_tasks for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "planner_tasks_delete_own"
on public.planner_tasks for delete
to authenticated
using (user_id = auth.uid());

-- Reminders
create policy "reminders_select_own"
on public.reminders for select
to authenticated
using (user_id = auth.uid());

create policy "reminders_insert_own"
on public.reminders for insert
to authenticated
with check (user_id = auth.uid());

create policy "reminders_update_own"
on public.reminders for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "reminders_delete_own"
on public.reminders for delete
to authenticated
using (user_id = auth.uid());

-- Pomodoro timer settings
create policy "pomodoro_timer_settings_select_own"
on public.pomodoro_timer_settings for select
to authenticated
using (user_id = auth.uid());

create policy "pomodoro_timer_settings_insert_own"
on public.pomodoro_timer_settings for insert
to authenticated
with check (user_id = auth.uid());

create policy "pomodoro_timer_settings_update_own"
on public.pomodoro_timer_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Pomodoro sessions
create policy "pomodoro_sessions_select_own"
on public.pomodoro_sessions for select
to authenticated
using (user_id = auth.uid());

create policy "pomodoro_sessions_insert_own"
on public.pomodoro_sessions for insert
to authenticated
with check (user_id = auth.uid());

create policy "pomodoro_sessions_delete_own"
on public.pomodoro_sessions for delete
to authenticated
using (user_id = auth.uid());

-- Daily update logs
create policy "daily_update_logs_select_own"
on public.daily_update_logs for select
to authenticated
using (user_id = auth.uid());

create policy "daily_update_logs_insert_own"
on public.daily_update_logs for insert
to authenticated
with check (user_id = auth.uid());

create policy "daily_update_logs_delete_own"
on public.daily_update_logs for delete
to authenticated
using (user_id = auth.uid());

-- OTP codes: no client access (edge functions use service role)
create policy "otp_codes_no_client_access"
on public.otp_codes
for all
to authenticated, anon
using (false)
with check (false);

-- ---------------------------------------------------------------------------
-- Storage: profile avatars bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Users can read any avatar (public bucket)
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- Users can upload only into their own folder: avatars/{user_id}/*
create policy "avatars_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update only their own avatar files
create policy "avatars_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete only their own avatar files
create policy "avatars_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- Convenience view (optional)
-- ---------------------------------------------------------------------------

create or replace view public.user_app_state
with (security_invoker = true)
as
select
  p.id as user_id,
  p.email,
  p.name,
  p.avatar_path,
  p.avatar_url,
  ns.browser_notifications_enabled,
  ns.sound,
  ns.daily_update_enabled,
  ns.morning_enabled,
  ns.morning_time,
  ns.evening_enabled,
  ns.evening_time,
  ns.include_completed,
  ns.include_remaining,
  pts.focus_seconds,
  pts.short_break_seconds,
  pts.long_break_seconds
from public.profiles p
left join public.notification_settings ns on ns.user_id = p.id
left join public.pomodoro_timer_settings pts on pts.user_id = p.id;

grant select on public.user_app_state to authenticated;

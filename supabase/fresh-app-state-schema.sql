-- =============================================================================
-- Whim Task - fresh Supabase schema
-- =============================================================================
--
-- Run this in a new Supabase project's SQL Editor.
-- Runtime app data is stored in one table:
--   public.app_state.state jsonb
--
-- Tables created:
--   public.profiles
--   public.app_state
--   public.otp_codes
--
-- Storage bucket created:
--   avatars
-- =============================================================================

create extension if not exists "pgcrypto";

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

create or replace function public.default_app_state(
  profile_name text,
  profile_email text,
  profile_avatar text default ''
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'app_settings',
      jsonb_build_object(
        'profile',
          jsonb_build_object(
            'name', coalesce(profile_name, ''),
            'email', coalesce(profile_email, ''),
            'avatar', coalesce(profile_avatar, '')
          ),
        'notifications',
          jsonb_build_object(
            'browserNotificationsEnabled', false,
            'sound', 'default',
            'dailyUpdate',
              jsonb_build_object(
                'enabled', false,
                'morningEnabled', true,
                'morningTime', '08:00',
                'eveningEnabled', true,
                'eveningTime', '21:00',
                'includeCompleted', true,
                'includeRemaining', true
              )
          )
      ),
    'notification_settings',
      jsonb_build_object(
        'browserNotificationsEnabled', false,
        'sound', 'default',
        'dailyUpdate',
          jsonb_build_object(
            'enabled', false,
            'morningEnabled', true,
            'morningTime', '08:00',
            'eveningEnabled', true,
            'eveningTime', '21:00',
            'includeCompleted', true,
            'includeRemaining', true
          )
      ),
    'planner_state', '{}'::jsonb,
    'routines', '[]'::jsonb,
    'reminders', '[]'::jsonb,
    'pomodoro_timer_defaults',
      jsonb_build_object(
        'focus', 1500,
        'short-break', 300,
        'long-break', 900
      ),
    'pomodoro_sessions_by_date', '{}'::jsonb,
    'task_dump_state',
      jsonb_build_object(
        'items', '[]'::jsonb,
        'completed', '[]'::jsonb,
        'draft', '',
        'isAdding', false,
        'showCompleted', false
      ),
    'daily_update_marker', null,
    'updated_at', now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
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

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Single app-state table
-- ---------------------------------------------------------------------------

create table if not exists public.app_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_state_updated_at_idx
on public.app_state (updated_at desc);

drop trigger if exists app_state_set_updated_at on public.app_state;

create trigger app_state_set_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Optional OTP audit table
-- ---------------------------------------------------------------------------
--
-- Current app auth uses Supabase Auth OTP. This table is kept only as a
-- server-side audit/extension point and is blocked from direct client access.

create table if not exists public.otp_codes (
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

create index if not exists otp_codes_email_created_idx
on public.otp_codes (email, created_at desc);

create index if not exists otp_codes_expires_at_idx
on public.otp_codes (expires_at);

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
  normalized_email text;
begin
  normalized_email := lower(new.email);
  derived_name := coalesce(
    nullif(new.raw_user_meta_data->>'name', ''),
    public.derive_name_from_email(normalized_email)
  );

  insert into public.profiles (id, email, name)
  values (new.id, normalized_email, derived_name)
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = now();

  insert into public.app_state (user_id, state)
  values (
    new.id,
    public.default_app_state(derived_name, normalized_email, '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill if you already created users before running this SQL.
insert into public.profiles (id, email, name)
select
  u.id,
  lower(u.email),
  coalesce(
    nullif(u.raw_user_meta_data->>'name', ''),
    public.derive_name_from_email(lower(u.email))
  )
from auth.users u
where u.email is not null
on conflict (id) do nothing;

insert into public.app_state (user_id, state)
select
  p.id,
  public.default_app_state(p.name, p.email, coalesce(p.avatar_url, ''))
from public.profiles p
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;
alter table public.otp_codes enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "app_state_select_own" on public.app_state;
drop policy if exists "app_state_insert_own" on public.app_state;
drop policy if exists "app_state_update_own" on public.app_state;
drop policy if exists "app_state_delete_own" on public.app_state;

create policy "app_state_select_own"
on public.app_state for select
to authenticated
using (user_id = auth.uid());

create policy "app_state_insert_own"
on public.app_state for insert
to authenticated
with check (user_id = auth.uid());

create policy "app_state_update_own"
on public.app_state for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "app_state_delete_own"
on public.app_state for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "otp_codes_no_client_access" on public.otp_codes;

create policy "otp_codes_no_client_access"
on public.otp_codes
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.app_state to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for profile avatars
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

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own_folder" on storage.objects;
drop policy if exists "avatars_update_own_folder" on storage.objects;
drop policy if exists "avatars_delete_own_folder" on storage.objects;

create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "avatars_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "avatars_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.app_state replica identity full;
alter table public.profiles replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.app_state;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profiles;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Verification output
-- ---------------------------------------------------------------------------

select
  'fresh schema ready' as status,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.app_state) as app_state_rows;

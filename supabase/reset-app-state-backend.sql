-- =============================================================================
-- Whim Task - single-table app backend reset
-- =============================================================================
--
-- This replaces the old normalized runtime tables with one per-user app_state
-- row. It keeps auth profiles, OTP codes, and avatar storage intact.
--
-- Run this once in Supabase SQL Editor before deploying the matching app code.
-- Existing normalized planner/routine/reminder/pomodoro data is migrated into
-- app_state before the old runtime tables are dropped.
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_state_set_updated_at on public.app_state;

create trigger app_state_set_updated_at
before update on public.app_state
for each row execute function public.set_updated_at();

alter table public.app_state enable row level security;

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

grant select, insert, update, delete on public.app_state to authenticated;

-- Migrate existing normalized rows into the new snapshot table when they exist.
-- If this script is rerun after the old tables are gone, only profile-backed
-- default app_state rows are inserted for users that still need one.
do $$
begin
  if to_regclass('public.notification_settings') is not null
     and to_regclass('public.routines') is not null
     and to_regclass('public.planner_days') is not null
     and to_regclass('public.planner_tasks') is not null
     and to_regclass('public.reminders') is not null
     and to_regclass('public.pomodoro_timer_settings') is not null
     and to_regclass('public.pomodoro_sessions') is not null
     and to_regclass('public.daily_update_logs') is not null then
    execute $migrate$
insert into public.app_state (user_id, state, updated_at)
select
  p.id,
  jsonb_build_object(
    'app_settings',
      jsonb_build_object(
        'profile',
          jsonb_build_object(
            'name', p.name,
            'email', p.email,
            'avatar', coalesce(p.avatar_url, '')
          ),
        'notifications',
          jsonb_build_object(
            'browserNotificationsEnabled', coalesce(ns.browser_notifications_enabled, false),
            'sound', coalesce(ns.sound::text, 'default'),
            'dailyUpdate',
              jsonb_build_object(
                'enabled', coalesce(ns.daily_update_enabled, false),
                'morningEnabled', coalesce(ns.morning_enabled, true),
                'morningTime', left(coalesce(ns.morning_time, '08:00'::time)::text, 5),
                'eveningEnabled', coalesce(ns.evening_enabled, true),
                'eveningTime', left(coalesce(ns.evening_time, '21:00'::time)::text, 5),
                'includeCompleted', coalesce(ns.include_completed, true),
                'includeRemaining', coalesce(ns.include_remaining, true)
              )
          )
      ),
    'notification_settings',
      jsonb_build_object(
        'browserNotificationsEnabled', coalesce(ns.browser_notifications_enabled, false),
        'sound', coalesce(ns.sound::text, 'default'),
        'dailyUpdate',
          jsonb_build_object(
            'enabled', coalesce(ns.daily_update_enabled, false),
            'morningEnabled', coalesce(ns.morning_enabled, true),
            'morningTime', left(coalesce(ns.morning_time, '08:00'::time)::text, 5),
            'eveningEnabled', coalesce(ns.evening_enabled, true),
            'eveningTime', left(coalesce(ns.evening_time, '21:00'::time)::text, 5),
            'includeCompleted', coalesce(ns.include_completed, true),
            'includeRemaining', coalesce(ns.include_remaining, true)
          )
      ),
    'planner_state',
      coalesce(
        (
          select jsonb_object_agg(
            d.date_key::text,
            jsonb_build_object(
              'tasks',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_strip_nulls(
                        jsonb_build_object(
                          'id', t.id,
                          'title', t.title,
                          'source', t.source::text,
                          'routineId', t.routine_id
                        )
                      )
                      order by t.sort_order
                    )
                    from public.planner_tasks t
                    where t.day_id = d.id
                      and t.status = 'active'
                  ),
                  '[]'::jsonb
                ),
              'completed',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_strip_nulls(
                        jsonb_build_object(
                          'id', t.id,
                          'title', t.title,
                          'source', t.source::text,
                          'routineId', t.routine_id
                        )
                      )
                      order by t.sort_order
                    )
                    from public.planner_tasks t
                    where t.day_id = d.id
                      and t.status = 'completed'
                  ),
                  '[]'::jsonb
                ),
              'draft', coalesce(d.draft, ''),
              'isAdding', coalesce(d.is_adding, false),
              'showCompleted', coalesce(d.show_completed, false)
            )
          )
          from public.planner_days d
          where d.user_id = p.id
        ),
        '{}'::jsonb
      ),
    'routines',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'title', r.title,
              'frequency', r.frequency::text,
              'weekDays', to_jsonb(coalesce(r.week_days, '{}'::integer[])),
              'monthDates', to_jsonb(coalesce(r.month_dates, '{}'::integer[])),
              'createdDateKey', r.created_date_key::text
            )
            order by r.created_date_key, r.created_at
          )
          from public.routines r
          where r.user_id = p.id
        ),
        '[]'::jsonb
      ),
    'reminders',
      coalesce(
        (
          select jsonb_agg(
            jsonb_strip_nulls(
              jsonb_build_object(
                'id', rm.id,
                'kind', rm.kind::text,
                'status', rm.status::text,
                'title', rm.title,
                'time', left(rm.reminder_time::text, 5),
                'dateKey', rm.date_key::text,
                'taskId', rm.task_id,
                'routineId', rm.routine_id,
                'lastTriggeredDateKey', rm.last_triggered_date_key::text,
                'scheduledAt', rm.scheduled_at,
                'createdAt', rm.created_at
              )
            )
            order by rm.created_at
          )
          from public.reminders rm
          where rm.user_id = p.id
        ),
        '[]'::jsonb
      ),
    'pomodoro_timer_defaults',
      jsonb_build_object(
        'focus', coalesce(pts.focus_seconds, 1500),
        'short-break', coalesce(pts.short_break_seconds, 300),
        'long-break', coalesce(pts.long_break_seconds, 900)
      ),
    'pomodoro_sessions_by_date',
      coalesce(
        (
          select jsonb_object_agg(session_day.date_key, session_day.logs)
          from (
            select
              ps.date_key::text as date_key,
              jsonb_agg(
                jsonb_build_object(
                  'id', ps.id,
                  'taskId', ps.task_id,
                  'taskTitle', ps.task_title,
                  'durationSeconds', ps.duration_seconds
                )
                order by ps.created_at
              ) as logs
            from public.pomodoro_sessions ps
            where ps.user_id = p.id
            group by ps.date_key
          ) session_day
        ),
        '{}'::jsonb
      ),
    'task_dump_state',
      jsonb_build_object(
        'items', '[]'::jsonb,
        'completed', '[]'::jsonb,
        'draft', '',
        'isAdding', false,
        'showCompleted', false
      ),
    'daily_update_marker',
      (
        select (dul.date_key::text || ':' || dul.slot::text)
        from public.daily_update_logs dul
        where dul.user_id = p.id
        order by dul.fired_at desc
        limit 1
      ),
    'updated_at', now()
  ),
  now()
from public.profiles p
left join public.notification_settings ns on ns.user_id = p.id
left join public.pomodoro_timer_settings pts on pts.user_id = p.id
on conflict (user_id) do update
set
  state = excluded.state,
  updated_at = now()
$migrate$;
  else
    insert into public.app_state (user_id, state, updated_at)
    select
      p.id,
      jsonb_build_object(
        'app_settings',
          jsonb_build_object(
            'profile',
              jsonb_build_object(
                'name', p.name,
                'email', p.email,
                'avatar', coalesce(p.avatar_url, '')
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
      ),
      now()
    from public.profiles p
    on conflict (user_id) do nothing;
  end if;
end $$;

-- Realtime: app data now has one source table.
alter table public.app_state replica identity full;
alter table public.profiles replica identity full;

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
    'user_sync_snapshots'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', tbl);
    exception
      when undefined_object or undefined_table then null;
    end;
  end loop;

  begin
    alter publication supabase_realtime add table public.app_state;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profiles;
  exception
    when duplicate_object then null;
  end;
end $$;

drop view if exists public.user_app_state;
drop table if exists public.user_sync_snapshots cascade;
drop table if exists public.daily_update_logs cascade;
drop table if exists public.pomodoro_sessions cascade;
drop table if exists public.pomodoro_timer_settings cascade;
drop table if exists public.reminders cascade;
drop table if exists public.planner_tasks cascade;
drop table if exists public.planner_days cascade;
drop table if exists public.routines cascade;
drop table if exists public.notification_settings cascade;

select
  user_id,
  updated_at,
  jsonb_object_keys(state) as state_section
from public.app_state
order by user_id, state_section;

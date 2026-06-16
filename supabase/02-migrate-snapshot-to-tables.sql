-- =============================================================================
-- Whim Task — Migrate user_sync_snapshots JSON into normalized tables
-- Run this FIRST if you have existing data in user_sync_snapshots.
-- Safe to run when the table is empty (no-op).
-- =============================================================================

create or replace function public.migrate_user_sync_snapshot(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  snap record;
  routine_item jsonb;
  reminder_item jsonb;
  day_key text;
  day_value jsonb;
  task_item jsonb;
  session_date text;
  session_logs jsonb;
  session_item jsonb;
  day_row_id uuid;
  sort_idx integer;
  marker_parts text[];
begin
  select *
  into snap
  from public.user_sync_snapshots
  where user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Notification settings
  if snap.notification_settings is not null
     and snap.notification_settings <> '{}'::jsonb then
    insert into public.notification_settings (
      user_id,
      browser_notifications_enabled,
      sound,
      daily_update_enabled,
      morning_enabled,
      morning_time,
      evening_enabled,
      evening_time,
      include_completed,
      include_remaining
    )
    values (
      p_user_id,
      coalesce((snap.notification_settings->>'browserNotificationsEnabled')::boolean, false),
      coalesce((snap.notification_settings->>'sound')::public.notification_sound, 'default'),
      coalesce((snap.notification_settings->'dailyUpdate'->>'enabled')::boolean, false),
      coalesce((snap.notification_settings->'dailyUpdate'->>'morningEnabled')::boolean, true),
      coalesce((snap.notification_settings->'dailyUpdate'->>'morningTime')::time, '08:00'::time),
      coalesce((snap.notification_settings->'dailyUpdate'->>'eveningEnabled')::boolean, true),
      coalesce((snap.notification_settings->'dailyUpdate'->>'eveningTime')::time, '21:00'::time),
      coalesce((snap.notification_settings->'dailyUpdate'->>'includeCompleted')::boolean, true),
      coalesce((snap.notification_settings->'dailyUpdate'->>'includeRemaining')::boolean, true)
    )
    on conflict (user_id) do update
    set
      browser_notifications_enabled = excluded.browser_notifications_enabled,
      sound = excluded.sound,
      daily_update_enabled = excluded.daily_update_enabled,
      morning_enabled = excluded.morning_enabled,
      morning_time = excluded.morning_time,
      evening_enabled = excluded.evening_enabled,
      evening_time = excluded.evening_time,
      include_completed = excluded.include_completed,
      include_remaining = excluded.include_remaining,
      updated_at = now();
  end if;

  -- Pomodoro timer defaults
  if snap.pomodoro_timer_defaults is not null
     and snap.pomodoro_timer_defaults <> '{}'::jsonb then
    insert into public.pomodoro_timer_settings (
      user_id,
      focus_seconds,
      short_break_seconds,
      long_break_seconds
    )
    values (
      p_user_id,
      coalesce((snap.pomodoro_timer_defaults->>'focus')::integer, 1500),
      coalesce((snap.pomodoro_timer_defaults->>'short-break')::integer, 300),
      coalesce((snap.pomodoro_timer_defaults->>'long-break')::integer, 900)
    )
    on conflict (user_id) do update
    set
      focus_seconds = excluded.focus_seconds,
      short_break_seconds = excluded.short_break_seconds,
      long_break_seconds = excluded.long_break_seconds,
      updated_at = now();
  end if;

  -- Routines
  for routine_item in
    select value
    from jsonb_array_elements(coalesce(snap.routines, '[]'::jsonb))
  loop
    insert into public.routines (
      id,
      user_id,
      title,
      frequency,
      week_days,
      month_dates,
      created_date_key
    )
    values (
      routine_item->>'id',
      p_user_id,
      routine_item->>'title',
      coalesce((routine_item->>'frequency')::public.routine_frequency, 'daily'),
      coalesce(
        (
          select coalesce(array_agg(value::integer), '{}'::integer[])
          from jsonb_array_elements_text(coalesce(routine_item->'weekDays', '[]'::jsonb)) as value
        ),
        '{}'::integer[]
      ),
      coalesce(
        (
          select coalesce(array_agg(value::integer), '{}'::integer[])
          from jsonb_array_elements_text(coalesce(routine_item->'monthDates', '[]'::jsonb)) as value
        ),
        '{}'::integer[]
      ),
      coalesce((routine_item->>'createdDateKey')::date, current_date)
    )
    on conflict (id) do update
    set
      title = excluded.title,
      frequency = excluded.frequency,
      week_days = excluded.week_days,
      month_dates = excluded.month_dates,
      created_date_key = excluded.created_date_key,
      updated_at = now();
  end loop;

  -- Planner days + tasks
  for day_key, day_value in
    select key, value
    from jsonb_each(coalesce(snap.planner_state, '{}'::jsonb))
  loop
    insert into public.planner_days (
      user_id,
      date_key,
      draft,
      is_adding,
      show_completed
    )
    values (
      p_user_id,
      day_key::date,
      coalesce(day_value->>'draft', ''),
      coalesce((day_value->>'isAdding')::boolean, false),
      coalesce((day_value->>'showCompleted')::boolean, false)
    )
    on conflict (user_id, date_key) do update
    set
      draft = excluded.draft,
      is_adding = excluded.is_adding,
      show_completed = excluded.show_completed,
      updated_at = now()
    returning id into day_row_id;

    if day_row_id is null then
      select id into day_row_id
      from public.planner_days
      where user_id = p_user_id
        and date_key = day_key::date;
    end if;

    sort_idx := 0;
    for task_item in
      select value
      from jsonb_array_elements(coalesce(day_value->'tasks', '[]'::jsonb))
    loop
      insert into public.planner_tasks (
        id,
        user_id,
        day_id,
        title,
        source,
        routine_id,
        status,
        sort_order
      )
      values (
        task_item->>'id',
        p_user_id,
        day_row_id,
        task_item->>'title',
        coalesce((task_item->>'source')::public.task_source, 'manual'),
        nullif(task_item->>'routineId', ''),
        'active',
        sort_idx
      )
      on conflict (id) do update
      set
        day_id = excluded.day_id,
        title = excluded.title,
        source = excluded.source,
        routine_id = excluded.routine_id,
        status = excluded.status,
        sort_order = excluded.sort_order,
        updated_at = now();

      sort_idx := sort_idx + 1;
    end loop;

    for task_item in
      select value
      from jsonb_array_elements(coalesce(day_value->'completed', '[]'::jsonb))
    loop
      insert into public.planner_tasks (
        id,
        user_id,
        day_id,
        title,
        source,
        routine_id,
        status,
        sort_order
      )
      values (
        task_item->>'id',
        p_user_id,
        day_row_id,
        task_item->>'title',
        coalesce((task_item->>'source')::public.task_source, 'manual'),
        nullif(task_item->>'routineId', ''),
        'completed',
        sort_idx
      )
      on conflict (id) do update
      set
        day_id = excluded.day_id,
        title = excluded.title,
        source = excluded.source,
        routine_id = excluded.routine_id,
        status = excluded.status,
        sort_order = excluded.sort_order,
        updated_at = now();

      sort_idx := sort_idx + 1;
    end loop;
  end loop;

  -- Reminders
  for reminder_item in
    select value
    from jsonb_array_elements(coalesce(snap.reminders, '[]'::jsonb))
  loop
    if reminder_item->>'kind' = 'task' then
      insert into public.reminders (
        id,
        user_id,
        kind,
        status,
        title,
        reminder_time,
        date_key,
        task_id,
        scheduled_at
      )
      values (
        reminder_item->>'id',
        p_user_id,
        'task',
        coalesce((reminder_item->>'status')::public.reminder_status, 'scheduled'),
        reminder_item->>'title',
        coalesce((reminder_item->>'time')::time, '09:00'::time),
        (reminder_item->>'dateKey')::date,
        reminder_item->>'taskId',
        (reminder_item->>'scheduledAt')::timestamptz
      )
      on conflict (id) do update
      set
        status = excluded.status,
        title = excluded.title,
        reminder_time = excluded.reminder_time,
        date_key = excluded.date_key,
        task_id = excluded.task_id,
        scheduled_at = excluded.scheduled_at,
        updated_at = now();
    elsif reminder_item->>'kind' = 'routine' then
      insert into public.reminders (
        id,
        user_id,
        kind,
        status,
        title,
        reminder_time,
        routine_id,
        last_triggered_date_key
      )
      values (
        reminder_item->>'id',
        p_user_id,
        'routine',
        coalesce((reminder_item->>'status')::public.reminder_status, 'scheduled'),
        reminder_item->>'title',
        coalesce((reminder_item->>'time')::time, '09:00'::time),
        reminder_item->>'routineId',
        nullif(reminder_item->>'lastTriggeredDateKey', '')::date
      )
      on conflict (id) do update
      set
        status = excluded.status,
        title = excluded.title,
        reminder_time = excluded.reminder_time,
        routine_id = excluded.routine_id,
        last_triggered_date_key = excluded.last_triggered_date_key,
        updated_at = now();
    end if;
  end loop;

  -- Pomodoro sessions by date
  for session_date, session_logs in
    select key, value
    from jsonb_each(coalesce(snap.pomodoro_sessions_by_date, '{}'::jsonb))
  loop
    for session_item in
      select value
      from jsonb_array_elements(session_logs)
    loop
      insert into public.pomodoro_sessions (
        id,
        user_id,
        date_key,
        task_id,
        task_title,
        duration_seconds
      )
      values (
        session_item->>'id',
        p_user_id,
        session_date::date,
        session_item->>'taskId',
        session_item->>'taskTitle',
        coalesce((session_item->>'durationSeconds')::integer, 1)
      )
      on conflict (id) do update
      set
        date_key = excluded.date_key,
        task_id = excluded.task_id,
        task_title = excluded.task_title,
        duration_seconds = excluded.duration_seconds;
    end loop;
  end loop;

  -- Daily update marker (YYYY-MM-DD:slot)
  if snap.daily_update_marker is not null and snap.daily_update_marker <> '' then
    marker_parts := string_to_array(snap.daily_update_marker, ':');

    if array_length(marker_parts, 1) = 2 then
      insert into public.daily_update_logs (user_id, date_key, slot)
      values (
        p_user_id,
        marker_parts[1]::date,
        marker_parts[2]::public.daily_update_slot
      )
      on conflict (user_id, date_key, slot) do nothing;
    end if;
  end if;
end;
$$;

-- Migrate every user that still has a snapshot row
do $$
declare
  uid uuid;
begin
  for uid in select user_id from public.user_sync_snapshots loop
    perform public.migrate_user_sync_snapshot(uid);
  end loop;
end;
$$;

select
  'migration complete' as status,
  (select count(*) from public.user_sync_snapshots) as snapshots_remaining,
  (select count(*) from public.planner_tasks) as planner_tasks,
  (select count(*) from public.routines) as routines;

import type { CloudSnapshot } from "@/lib/cloud-store"
import { DEFAULT_POMODORO_TIMER_VALUES } from "@/lib/pomodoro-timer"
import { DEFAULT_SETTINGS } from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  assembleSnapshot,
  buildAppSettings,
  buildDailyUpdateMarker,
  buildPlannerStateFromRows,
  latestUpdatedAt,
  pomodoroSessionFromRow,
  pomodoroTimerFromRow,
  reminderFromRow,
  routineFromRow,
  type DailyUpdateLogRow,
  type PlannerDayRow,
  type PlannerTaskRow,
  type PomodoroSessionRow,
  type PomodoroTimerRow,
  type ProfileRow,
  type ReminderRow,
  type RoutineRow,
  mapNotificationSettingsFromRow,
} from "@/lib/db/mappers"

export async function loadAppStateFromDb(
  userId: string,
): Promise<CloudSnapshot | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = getSupabaseClient()

  const [
    profileResult,
    notificationResult,
    routinesResult,
    daysResult,
    tasksResult,
    remindersResult,
    pomodoroTimerResult,
    pomodoroSessionsResult,
    dailyLogsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, email, avatar_url, updated_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("notification_settings")
      .select(
        "browser_notifications_enabled, sound, daily_update_enabled, morning_enabled, morning_time, evening_enabled, evening_time, include_completed, include_remaining, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("routines")
      .select(
        "id, title, frequency, week_days, month_dates, created_date_key, updated_at",
      )
      .eq("user_id", userId)
      .order("created_date_key", { ascending: true }),
    supabase
      .from("planner_days")
      .select("id, date_key, draft, is_adding, show_completed, updated_at")
      .eq("user_id", userId),
    supabase
      .from("planner_tasks")
      .select(
        "id, day_id, title, source, routine_id, status, sort_order, updated_at",
      )
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("reminders")
      .select(
        "id, kind, status, title, reminder_time, date_key, task_id, routine_id, last_triggered_date_key, scheduled_at, updated_at",
      )
      .eq("user_id", userId),
    supabase
      .from("pomodoro_timer_settings")
      .select("focus_seconds, short_break_seconds, long_break_seconds, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("pomodoro_sessions")
      .select("id, date_key, task_id, task_title, duration_seconds, created_at")
      .eq("user_id", userId)
      .order("date_key", { ascending: false }),
    supabase
      .from("daily_update_logs")
      .select("date_key, slot, fired_at")
      .eq("user_id", userId)
      .order("date_key", { ascending: true }),
  ])

  const firstError =
    profileResult.error ??
    notificationResult.error ??
    routinesResult.error ??
    daysResult.error ??
    tasksResult.error ??
    remindersResult.error ??
    pomodoroTimerResult.error ??
    pomodoroSessionsResult.error ??
    dailyLogsResult.error

  if (firstError) {
    console.error(
      "[Whim Task sync] Could not load app state:",
      firstError.message,
      "— Run supabase/04-normalized-realtime-setup.sql",
    )
    return null
  }

  const profile = (profileResult.data ?? {
    name: DEFAULT_SETTINGS.profile.name,
    email: DEFAULT_SETTINGS.profile.email,
    avatar_url: "",
  }) as ProfileRow

  const notifications = notificationResult.data
    ? mapNotificationSettingsFromRow(notificationResult.data)
    : DEFAULT_SETTINGS.notifications

  const routines = ((routinesResult.data ?? []) as RoutineRow[]).map(routineFromRow)
  const days = (daysResult.data ?? []) as PlannerDayRow[]
  const tasks = (tasksResult.data ?? []) as PlannerTaskRow[]
  const reminders = ((remindersResult.data ?? []) as ReminderRow[]).map(
    reminderFromRow,
  )

  const pomodoroTimerDefaults = pomodoroTimerResult.data
    ? pomodoroTimerFromRow(pomodoroTimerResult.data as PomodoroTimerRow)
    : { ...DEFAULT_POMODORO_TIMER_VALUES }

  const pomodoroSessionsByDate: Record<string, ReturnType<typeof pomodoroSessionFromRow>[]> =
    {}

  for (const row of (pomodoroSessionsResult.data ?? []) as PomodoroSessionRow[]) {
    const dateKey = row.date_key
    pomodoroSessionsByDate[dateKey] ??= []
    pomodoroSessionsByDate[dateKey].push(pomodoroSessionFromRow(row))
  }

  const dailyUpdateMarker = buildDailyUpdateMarker(
    (dailyLogsResult.data ?? []) as DailyUpdateLogRow[],
  )

  const updatedAt = latestUpdatedAt([
    profile.updated_at,
    notificationResult.data?.updated_at,
    ...((routinesResult.data ?? []) as RoutineRow[]).map((row) => row.updated_at),
    ...days.map((row) => row.updated_at),
    ...tasks.map((row) => row.updated_at),
    ...((remindersResult.data ?? []) as ReminderRow[]).map((row) => row.updated_at),
    pomodoroTimerResult.data?.updated_at,
    ...((pomodoroSessionsResult.data ?? []) as PomodoroSessionRow[]).map(
      (row) => row.created_at,
    ),
    ...((dailyLogsResult.data ?? []) as DailyUpdateLogRow[]).map(
      (row) => row.fired_at,
    ),
  ])

  return assembleSnapshot({
    appSettings: buildAppSettings(profile, notifications),
    plannerState: buildPlannerStateFromRows(days, tasks),
    routines,
    reminders,
    pomodoroTimerDefaults,
    pomodoroSessionsByDate,
    dailyUpdateMarker,
    updatedAt,
  })
}

export function appStateHasRows(snapshot: CloudSnapshot) {
  return (
    snapshot.routines.length > 0 ||
    snapshot.reminders.length > 0 ||
    Object.keys(snapshot.planner_state).length > 0 ||
    Object.values(snapshot.pomodoro_sessions_by_date).some((logs) => logs.length > 0)
  )
}

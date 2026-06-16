import type { CloudSnapshot } from "@/lib/cloud-store"
import type { PlannerDayState, PlannerTask, RoutineRule } from "@/lib/planner"
import type { PomodoroSessionLog } from "@/lib/pomodoro-sessions"
import type { PomodoroTimerDefaults } from "@/lib/pomodoro-timer"
import type { Reminder, RoutineReminder, TaskReminder } from "@/lib/reminders"
import type { AppSettings } from "@/lib/settings"
import { createEmptyDayState } from "@/lib/planner"
import {
  mapNotificationSettingsFromRow,
  mapNotificationSettingsToRow,
} from "@/lib/notification-settings-sync"

export type RoutineRow = {
  created_date_key: string
  frequency: RoutineRule["frequency"]
  id: string
  month_dates: number[]
  title: string
  updated_at?: string
  week_days: number[]
}

export type PlannerDayRow = {
  date_key: string
  draft: string
  id: string
  is_adding: boolean
  show_completed: boolean
  updated_at?: string
}

export type PlannerTaskRow = {
  day_id: string
  id: string
  routine_id: string | null
  sort_order: number
  source: PlannerTask["source"]
  status: "active" | "completed"
  title: string
  updated_at?: string
}

export type ReminderRow = {
  date_key: string | null
  id: string
  kind: "task" | "routine"
  last_triggered_date_key: string | null
  reminder_time: string
  routine_id: string | null
  scheduled_at: string | null
  status: Reminder["status"]
  task_id: string | null
  title: string
  updated_at?: string
}

export type PomodoroSessionRow = {
  date_key: string
  duration_seconds: number
  id: string
  task_id: string
  task_title: string
}

export type PomodoroTimerRow = {
  focus_seconds: number
  long_break_seconds: number
  short_break_seconds: number
  updated_at?: string
}

export type DailyUpdateLogRow = {
  date_key: string
  slot: "morning" | "evening"
}

export type ProfileRow = {
  avatar_url: string | null
  email: string
  name: string
  updated_at?: string
}

function timeToApp(value: string) {
  return value.slice(0, 5)
}

export function routineFromRow(row: RoutineRow): RoutineRule {
  return {
    id: row.id,
    title: row.title,
    frequency: row.frequency,
    weekDays: row.week_days ?? [],
    monthDates: row.month_dates ?? [],
    createdDateKey: row.created_date_key,
  }
}

export function routineToRow(userId: string, routine: RoutineRule): RoutineRow {
  return {
    id: routine.id,
    title: routine.title,
    frequency: routine.frequency,
    week_days: routine.weekDays,
    month_dates: routine.monthDates,
    created_date_key: routine.createdDateKey,
  }
}

export function reminderFromRow(row: ReminderRow): Reminder {
  if (row.kind === "task") {
    return {
      id: row.id,
      kind: "task",
      taskId: row.task_id ?? "",
      dateKey: row.date_key ?? "",
      title: row.title,
      time: timeToApp(row.reminder_time),
      scheduledAt: row.scheduled_at ?? new Date().toISOString(),
      status: row.status,
      createdAt: new Date().toISOString(),
    } satisfies TaskReminder
  }

  return {
    id: row.id,
    kind: "routine",
    routineId: row.routine_id ?? "",
    title: row.title,
    time: timeToApp(row.reminder_time),
    status: row.status,
    lastTriggeredDateKey: row.last_triggered_date_key ?? undefined,
    createdAt: new Date().toISOString(),
  } satisfies RoutineReminder
}

export function reminderToRow(userId: string, reminder: Reminder): ReminderRow {
  if (reminder.kind === "task") {
    return {
      id: reminder.id,
      kind: "task",
      status: reminder.status,
      title: reminder.title,
      reminder_time: `${reminder.time}:00`,
      date_key: reminder.dateKey,
      task_id: reminder.taskId,
      routine_id: null,
      last_triggered_date_key: null,
      scheduled_at: reminder.scheduledAt,
    }
  }

  return {
    id: reminder.id,
    kind: "routine",
    status: reminder.status,
    title: reminder.title,
    reminder_time: `${reminder.time}:00`,
    routine_id: reminder.routineId,
    date_key: null,
    task_id: null,
    last_triggered_date_key: reminder.lastTriggeredDateKey ?? null,
    scheduled_at: null,
  }
}

export function pomodoroSessionFromRow(row: PomodoroSessionRow): PomodoroSessionLog {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    durationSeconds: row.duration_seconds,
  }
}

export function pomodoroTimerFromRow(row: PomodoroTimerRow): PomodoroTimerDefaults {
  return {
    focus: row.focus_seconds,
    "short-break": row.short_break_seconds,
    "long-break": row.long_break_seconds,
  }
}

export function pomodoroTimerToRow(
  userId: string,
  defaults: PomodoroTimerDefaults,
): PomodoroTimerRow & { user_id: string } {
  return {
    user_id: userId,
    focus_seconds: defaults.focus,
    short_break_seconds: defaults["short-break"],
    long_break_seconds: defaults["long-break"],
  }
}

export function buildPlannerStateFromRows(
  days: PlannerDayRow[],
  tasks: PlannerTaskRow[],
): Record<string, PlannerDayState> {
  const dayIdToKey = new Map(days.map((day) => [day.id, day.date_key]))
  const plannerState: Record<string, PlannerDayState> = {}

  for (const day of days) {
    plannerState[day.date_key] = {
      ...createEmptyDayState(),
      draft: "",
      isAdding: false,
      showCompleted: day.show_completed,
    }
  }

  const sortedTasks = [...tasks].sort((left, right) => left.sort_order - right.sort_order)

  for (const task of sortedTasks) {
    const dateKey = dayIdToKey.get(task.day_id)
    if (!dateKey) {
      continue
    }

    const day = plannerState[dateKey] ?? createEmptyDayState()
    plannerState[dateKey] = day

    const plannerTask: PlannerTask = {
      id: task.id,
      title: task.title,
      source: task.source,
      ...(task.routine_id ? { routineId: task.routine_id } : {}),
    }

    if (task.status === "completed") {
      day.completed.push(plannerTask)
    } else {
      day.tasks.push(plannerTask)
    }
  }

  return plannerState
}

export function buildDailyUpdateMarker(logs: DailyUpdateLogRow[]) {
  if (logs.length === 0) {
    return null
  }

  const latest = logs[logs.length - 1]
  return `${latest.date_key}:${latest.slot}`
}

export function parseDailyUpdateMarker(marker: string | null) {
  if (!marker) {
    return null
  }

  const [dateKey, slot] = marker.split(":")

  if (!dateKey || (slot !== "morning" && slot !== "evening")) {
    return null
  }

  return { date_key: dateKey, slot } as DailyUpdateLogRow
}

export function buildAppSettings(
  profile: ProfileRow,
  notifications: ReturnType<typeof mapNotificationSettingsFromRow>,
): AppSettings {
  return {
    profile: {
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar_url ?? "",
    },
    notifications,
  }
}

export function latestUpdatedAt(values: Array<string | undefined>) {
  return values
    .filter(Boolean)
    .sort((left, right) => Date.parse(right!) - Date.parse(left!))[0] ??
    new Date().toISOString()
}

export function assembleSnapshot(input: {
  appSettings: AppSettings
  dailyUpdateMarker: string | null
  plannerState: Record<string, PlannerDayState>
  pomodoroSessionsByDate: Record<string, PomodoroSessionLog[]>
  pomodoroTimerDefaults: PomodoroTimerDefaults
  reminders: Reminder[]
  routines: RoutineRule[]
  updatedAt: string
}): CloudSnapshot {
  return {
    app_settings: input.appSettings,
    notification_settings: input.appSettings.notifications,
    planner_state: input.plannerState,
    routines: input.routines,
    reminders: input.reminders,
    pomodoro_timer_defaults: input.pomodoroTimerDefaults,
    pomodoro_sessions_by_date: input.pomodoroSessionsByDate,
    daily_update_marker: input.dailyUpdateMarker,
    updated_at: input.updatedAt,
  }
}

export { mapNotificationSettingsFromRow, mapNotificationSettingsToRow }

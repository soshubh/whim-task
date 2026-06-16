import type { PomodoroSessionLog } from "@/lib/pomodoro-sessions"
import {
  DEFAULT_POMODORO_TIMER_VALUES,
  type PomodoroTimerDefaults,
} from "@/lib/pomodoro-timer"
import type { PlannerDayState, PlannerTask, RoutineRule } from "@/lib/planner"
import type { Reminder } from "@/lib/reminders"
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type NotificationSettings,
} from "@/lib/settings"
import {
  getScopedStorageKey,
  readScopedItem,
  readScopedJson,
} from "@/lib/user-storage"

export type CloudSnapshot = {
  app_settings: AppSettings
  daily_update_marker: string | null
  notification_settings: NotificationSettings
  planner_state: Record<string, PlannerDayState>
  pomodoro_sessions_by_date: Record<string, PomodoroSessionLog[]>
  pomodoro_timer_defaults: PomodoroTimerDefaults
  reminders: Reminder[]
  routines: RoutineRule[]
  task_dump_state: TaskDumpState
  updated_at: string
}

export type TaskDumpState = {
  completed: PlannerTask[]
  draft: string
  isAdding: boolean
  items: PlannerTask[]
  showCompleted: boolean
}

const LEGACY_KEYS = {
  planner: "whim-task-planner-state",
  routines: "whim-task-routines",
  reminders: "whim-task-reminders",
  settings: "whim-task-settings",
  pomodoroTimer: "whim-task-pomodoro-timer-defaults",
  dailyUpdate: "whim-task-last-daily-update",
} as const

let memorySnapshot: CloudSnapshot | null = null
let localEditGeneration = 0
let lastPushCompletedGeneration = 0

export function createEmptyTaskDumpState(): TaskDumpState {
  return {
    items: [],
    completed: [],
    draft: "",
    isAdding: false,
    showCompleted: false,
  }
}

export function getCloudSnapshot() {
  return memorySnapshot
}

export function setCloudSnapshot(
  snapshot: CloudSnapshot,
  options?: { fromRemote?: boolean },
) {
  memorySnapshot = snapshot

  if (options?.fromRemote) {
    lastPushCompletedGeneration = localEditGeneration
  }
}

export function clearCloudSnapshot() {
  memorySnapshot = null
  localEditGeneration = 0
  lastPushCompletedGeneration = 0
}

export function hasPendingLocalChanges() {
  return localEditGeneration > lastPushCompletedGeneration
}

export function markPushCompleted() {
  lastPushCompletedGeneration = localEditGeneration
}

export function createEmptyCloudSnapshot(
  appSettings: AppSettings = DEFAULT_SETTINGS,
): CloudSnapshot {
  return {
    app_settings: appSettings,
    planner_state: {},
    routines: [],
    reminders: [],
    notification_settings: appSettings.notifications,
    pomodoro_timer_defaults: { ...DEFAULT_POMODORO_TIMER_VALUES },
    pomodoro_sessions_by_date: {},
    task_dump_state: createEmptyTaskDumpState(),
    daily_update_marker: null,
    updated_at: new Date().toISOString(),
  }
}

export function normalizeCloudSnapshot(
  input: Partial<CloudSnapshot> | null | undefined,
  fallbackSettings: AppSettings = DEFAULT_SETTINGS,
): CloudSnapshot {
  const empty = createEmptyCloudSnapshot(fallbackSettings)
  const appSettings = input?.app_settings ?? empty.app_settings

  return {
    ...empty,
    ...input,
    app_settings: appSettings,
    notification_settings:
      input?.notification_settings ??
      appSettings.notifications ??
      empty.notification_settings,
    pomodoro_timer_defaults: {
      ...empty.pomodoro_timer_defaults,
      ...(input?.pomodoro_timer_defaults ?? {}),
    },
    task_dump_state: {
      ...empty.task_dump_state,
      ...(input?.task_dump_state ?? {}),
      items: input?.task_dump_state?.items ?? empty.task_dump_state.items,
      completed:
        input?.task_dump_state?.completed ?? empty.task_dump_state.completed,
    },
    updated_at: input?.updated_at ?? empty.updated_at,
  }
}

export function patchCloudSnapshot(
  patch: Partial<CloudSnapshot>,
  options?: { skipLocalBump?: boolean },
): CloudSnapshot {
  const current = memorySnapshot ?? createEmptyCloudSnapshot()
  const appSettings = patch.app_settings ?? current.app_settings

  if (!options?.skipLocalBump) {
    localEditGeneration += 1
  }

  memorySnapshot = {
    ...current,
    ...patch,
    app_settings: appSettings,
    notification_settings:
      patch.notification_settings ??
      patch.app_settings?.notifications ??
      current.notification_settings,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  }

  return memorySnapshot
}

function collectLegacyPomodoroSessions(userId: string) {
  const prefix = getScopedStorageKey("whim-task-pomodoro-session-log-", userId)
  const sessions: Record<string, PomodoroSessionLog[]> = {}

  if (typeof window === "undefined") {
    return sessions
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (!key?.startsWith(prefix)) {
      continue
    }

    const dateKey = key.slice(prefix.length)

    if (!dateKey) {
      continue
    }

    try {
      const stored = readScopedItem(`whim-task-pomodoro-session-log-${dateKey}`)
      sessions[dateKey] = stored
        ? (JSON.parse(stored) as PomodoroSessionLog[])
        : []
    } catch {
      sessions[dateKey] = []
    }
  }

  return sessions
}

export function importLegacyLocalStorage(userId: string): CloudSnapshot | null {
  if (typeof window === "undefined") {
    return null
  }

  const appSettings = readScopedJson<AppSettings>(LEGACY_KEYS.settings, DEFAULT_SETTINGS)
  const plannerState = readScopedJson<Record<string, PlannerDayState>>(
    LEGACY_KEYS.planner,
    {},
  )
  const routines = readScopedJson<RoutineRule[]>(LEGACY_KEYS.routines, [])
  const reminders = readScopedJson<Reminder[]>(LEGACY_KEYS.reminders, [])
  const pomodoroTimerDefaults = readScopedJson<PomodoroTimerDefaults>(
    LEGACY_KEYS.pomodoroTimer,
    DEFAULT_POMODORO_TIMER_VALUES,
  )
  const pomodoroSessions = collectLegacyPomodoroSessions(userId)
  const dailyUpdateMarker = readScopedItem(LEGACY_KEYS.dailyUpdate)

  const hasData =
    routines.length > 0 ||
    reminders.length > 0 ||
    Object.keys(plannerState).length > 0 ||
    Object.values(pomodoroSessions).some((logs) => logs.length > 0)

  if (!hasData) {
    return null
  }

  return {
    app_settings: appSettings,
    planner_state: plannerState,
    routines,
    reminders,
    notification_settings: appSettings.notifications,
    pomodoro_timer_defaults: {
      ...DEFAULT_POMODORO_TIMER_VALUES,
      ...pomodoroTimerDefaults,
    },
    pomodoro_sessions_by_date: pomodoroSessions,
    task_dump_state: createEmptyTaskDumpState(),
    daily_update_marker: dailyUpdateMarker,
    updated_at: new Date().toISOString(),
  }
}

export function clearLegacyAppLocalStorage(userId: string) {
  if (typeof window === "undefined") {
    return
  }

  const keysToRemove: string[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (!key) {
      continue
    }

    if (key.startsWith(`whim-task:user:${userId}:`)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }
}

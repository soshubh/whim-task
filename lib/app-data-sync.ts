import type { PlannerDayState, RoutineRule } from "@/lib/planner"
import {
  DEFAULT_POMODORO_TIMER_VALUES,
  loadPomodoroTimerDefaults,
  type PomodoroTimerDefaults,
} from "@/lib/pomodoro-timer"
import {
  getPomodoroSessionLogKey,
  loadPomodoroSessionLogs,
  type PomodoroSessionLog,
} from "@/lib/pomodoro-sessions"
import {
  fetchRemoteNotificationSettings,
  notificationSettingsDifferFromDefault,
  saveRemoteNotificationSettings,
} from "@/lib/notification-settings-sync"
import { loadReminders, REMINDERS_STORAGE_KEY, type Reminder } from "@/lib/reminders"
import {
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type AppSettings,
  type NotificationSettings,
} from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  getActiveUserId,
  getScopedStorageKey,
  readScopedItem,
  readScopedJson,
  writeScopedItem,
  writeScopedJson,
} from "@/lib/user-storage"

export const APP_DATA_SYNCED_EVENT = "whim-app-data-synced"

const PLANNER_STORAGE_KEY = "whim-task-planner-state"
const ROUTINES_STORAGE_KEY = "whim-task-routines"
const LOCAL_UPDATED_AT_KEY = "whim-task-local-updated-at"
const DAILY_UPDATE_MARKER_KEY = "whim-task-last-daily-update"
const POMODORO_TIMER_STORAGE_KEY = "whim-task-pomodoro-timer-defaults"

export type UserSyncSnapshot = {
  app_settings: AppSettings
  daily_update_marker: string | null
  notification_settings: NotificationSettings
  planner_state: Record<string, PlannerDayState>
  pomodoro_sessions_by_date: Record<string, PomodoroSessionLog[]>
  pomodoro_timer_defaults: PomodoroTimerDefaults
  reminders: Reminder[]
  routines: RoutineRule[]
  updated_at: string
}

export type UserSyncSnapshotRow = {
  app_settings: AppSettings | null
  daily_update_marker: string | null
  notification_settings: NotificationSettings | null
  planner_state: Record<string, PlannerDayState> | null
  pomodoro_sessions_by_date: Record<string, PomodoroSessionLog[]> | null
  pomodoro_timer_defaults: PomodoroTimerDefaults | null
  reminders: Reminder[] | null
  routines: RoutineRule[] | null
  updated_at: string
  user_id: string
}

let isApplyingRemote = false
let pushDebounceId: number | null = null
let lastAppliedRemoteUpdatedAt: string | null = null

function touchLocalUpdatedAt(iso = new Date().toISOString()) {
  writeScopedItem(LOCAL_UPDATED_AT_KEY, iso)
}

function readLocalUpdatedAt() {
  return readScopedItem(LOCAL_UPDATED_AT_KEY)
}

function mergeAppSettings(
  current: AppSettings,
  incoming: Partial<AppSettings> | null | undefined,
  incomingNotifications: NotificationSettings | null | undefined,
): AppSettings {
  const notifications = incomingNotifications ??
    incoming?.notifications ?? {
      ...current.notifications,
    }

  return {
    profile: {
      ...current.profile,
      ...incoming?.profile,
      email: incoming?.profile?.email || current.profile.email,
    },
    notifications: {
      ...current.notifications,
      ...notifications,
      dailyUpdate: {
        ...current.notifications.dailyUpdate,
        ...notifications.dailyUpdate,
      },
    },
  }
}

function collectPomodoroSessionsByDate(userId: string) {
  const logPrefix = getScopedStorageKey(getPomodoroSessionLogKey(""), userId)
  const sessions: Record<string, PomodoroSessionLog[]> = {}

  if (typeof window === "undefined") {
    return sessions
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)

    if (!key || !key.startsWith(logPrefix)) {
      continue
    }

    const dateKey = key.slice(logPrefix.length)

    if (!dateKey) {
      continue
    }

    sessions[dateKey] = loadPomodoroSessionLogs(dateKey)
  }

  return sessions
}

function hasPlannerContent(state: Record<string, PlannerDayState>) {
  return Object.values(state).some(
    (day) =>
      day.tasks.length > 0 ||
      day.completed.length > 0 ||
      day.draft.trim().length > 0,
  )
}

export function snapshotHasData(snapshot: Pick<
  UserSyncSnapshot,
  | "app_settings"
  | "notification_settings"
  | "planner_state"
  | "reminders"
  | "routines"
  | "pomodoro_sessions_by_date"
>) {
  if (snapshot.routines.length > 0 || snapshot.reminders.length > 0) {
    return true
  }

  if (hasPlannerContent(snapshot.planner_state)) {
    return true
  }

  if (
    notificationSettingsDifferFromDefault(snapshot.notification_settings) ||
    notificationSettingsDifferFromDefault(snapshot.app_settings.notifications)
  ) {
    return true
  }

  return Object.values(snapshot.pomodoro_sessions_by_date).some(
    (logs) => logs.length > 0,
  )
}

export function collectLocalSnapshot(userId: string): UserSyncSnapshot {
  const appSettings = loadSettings()

  return {
    app_settings: appSettings,
    planner_state: readScopedJson<Record<string, PlannerDayState>>(
      PLANNER_STORAGE_KEY,
      {},
    ),
    routines: readScopedJson<RoutineRule[]>(ROUTINES_STORAGE_KEY, []),
    reminders: loadReminders(),
    notification_settings: appSettings.notifications,
    pomodoro_timer_defaults: loadPomodoroTimerDefaults(),
    pomodoro_sessions_by_date: collectPomodoroSessionsByDate(userId),
    daily_update_marker: readScopedItem(DAILY_UPDATE_MARKER_KEY),
    updated_at: new Date().toISOString(),
  }
}

function writePomodoroSessionsByDate(
  sessionsByDate: Record<string, PomodoroSessionLog[]>,
) {
  for (const [dateKey, logs] of Object.entries(sessionsByDate)) {
    writeScopedItem(getPomodoroSessionLogKey(dateKey), JSON.stringify(logs))
    writeScopedItem(`whim-task-pomodoro-sessions-${dateKey}`, `${logs.length}`)
  }
}

export function applySnapshotToLocal(snapshot: UserSyncSnapshot) {
  if (typeof window === "undefined") {
    return
  }

  isApplyingRemote = true

  try {
    writeScopedJson(PLANNER_STORAGE_KEY, snapshot.planner_state)
    writeScopedJson(ROUTINES_STORAGE_KEY, snapshot.routines)
    writeScopedJson(REMINDERS_STORAGE_KEY, snapshot.reminders)
    writeScopedJson(POMODORO_TIMER_STORAGE_KEY, snapshot.pomodoro_timer_defaults)
    writePomodoroSessionsByDate(snapshot.pomodoro_sessions_by_date)

    if (snapshot.daily_update_marker) {
      writeScopedItem(DAILY_UPDATE_MARKER_KEY, snapshot.daily_update_marker)
    } else {
      writeScopedItem(DAILY_UPDATE_MARKER_KEY, "")
    }

    saveSettings(snapshot.app_settings)
    writeScopedItem(LOCAL_UPDATED_AT_KEY, snapshot.updated_at)
    lastAppliedRemoteUpdatedAt = snapshot.updated_at
  } finally {
    isApplyingRemote = false
  }

  window.dispatchEvent(new CustomEvent(APP_DATA_SYNCED_EVENT))
}

function rowToSnapshot(
  row: UserSyncSnapshotRow,
  tableNotifications: NotificationSettings | null,
): UserSyncSnapshot {
  const currentSettings = loadSettings()
  const notificationSettings =
    tableNotifications ??
    mergeAppSettings(currentSettings, row.app_settings, row.notification_settings)
      .notifications

  const appSettings = mergeAppSettings(
    currentSettings,
    row.app_settings,
    notificationSettings,
  )

  return {
    app_settings: appSettings,
    planner_state: row.planner_state ?? {},
    routines: row.routines ?? [],
    reminders: row.reminders ?? [],
    notification_settings: appSettings.notifications,
    pomodoro_timer_defaults: {
      ...DEFAULT_POMODORO_TIMER_VALUES,
      ...row.pomodoro_timer_defaults,
    },
    pomodoro_sessions_by_date: row.pomodoro_sessions_by_date ?? {},
    daily_update_marker: row.daily_update_marker,
    updated_at: row.updated_at,
  }
}

export function applyRemoteSnapshotRow(row: UserSyncSnapshotRow) {
  if (row.updated_at && row.updated_at === lastAppliedRemoteUpdatedAt) {
    return
  }

  applySnapshotToLocal(rowToSnapshot(row, null))
}

export async function fetchRemoteSnapshot(
  userId: string,
): Promise<UserSyncSnapshot | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = getSupabaseClient()
  const [{ data, error }, tableNotifications] = await Promise.all([
    supabase
      .from("user_sync_snapshots")
      .select(
        "user_id, planner_state, routines, reminders, notification_settings, app_settings, pomodoro_timer_defaults, pomodoro_sessions_by_date, daily_update_marker, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    fetchRemoteNotificationSettings(userId),
  ])

  if (error || !data) {
    return null
  }

  return rowToSnapshot(data as UserSyncSnapshotRow, tableNotifications)
}

export async function pushRemoteSnapshot(
  userId: string,
  snapshot: UserSyncSnapshot,
) {
  if (!isSupabaseConfigured()) {
    return
  }

  const supabase = getSupabaseClient()
  const payload = {
    user_id: userId,
    planner_state: snapshot.planner_state,
    routines: snapshot.routines,
    reminders: snapshot.reminders,
    notification_settings: snapshot.notification_settings,
    app_settings: snapshot.app_settings,
    pomodoro_timer_defaults: snapshot.pomodoro_timer_defaults,
    pomodoro_sessions_by_date: snapshot.pomodoro_sessions_by_date,
    daily_update_marker: snapshot.daily_update_marker,
    updated_at: snapshot.updated_at,
  }

  const { error } = await supabase.from("user_sync_snapshots").upsert(payload)

  if (error) {
    throw new Error(error.message || "Could not save app data to Supabase.")
  }

  await saveRemoteNotificationSettings(userId, snapshot.app_settings.notifications)

  touchLocalUpdatedAt(snapshot.updated_at)
  lastAppliedRemoteUpdatedAt = snapshot.updated_at
}

type SyncOptions = {
  preferRemote?: boolean
}

export async function syncAppDataFromRemote(
  userId: string,
  options: SyncOptions = {},
) {
  if (!isSupabaseConfigured()) {
    return
  }

  const localSnapshot = collectLocalSnapshot(userId)
  const remoteSnapshot = await fetchRemoteSnapshot(userId)
  const localUpdatedAt = readLocalUpdatedAt()
  const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : 0
  const remoteTime = remoteSnapshot ? Date.parse(remoteSnapshot.updated_at) : 0

  if (!remoteSnapshot) {
    if (snapshotHasData(localSnapshot)) {
      await pushRemoteSnapshot(userId, localSnapshot)
    }

    return
  }

  if (options.preferRemote || remoteTime >= localTime) {
    applySnapshotToLocal(remoteSnapshot)
    return
  }

  if (snapshotHasData(localSnapshot)) {
    await pushRemoteSnapshot(userId, localSnapshot)
  }
}

export function schedulePushAppData() {
  if (isApplyingRemote || typeof window === "undefined") {
    return
  }

  const userId = getActiveUserId()

  if (!userId || !isSupabaseConfigured()) {
    return
  }

  touchLocalUpdatedAt()

  if (pushDebounceId !== null) {
    window.clearTimeout(pushDebounceId)
  }

  pushDebounceId = window.setTimeout(() => {
    pushDebounceId = null

    void (async () => {
      try {
        await pushRemoteSnapshot(userId, collectLocalSnapshot(userId))
      } catch (error) {
        console.error("Failed to sync app data to Supabase", error)
      }
    })()
  }, 800)
}

export function subscribeToRemoteSnapshot(
  userId: string,
  onUpdate: (row: UserSyncSnapshotRow) => void,
) {
  if (!isSupabaseConfigured()) {
    return () => undefined
  }

  const supabase = getSupabaseClient()
  const channel = supabase
    .channel(`user-sync:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_sync_snapshots",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === "object") {
          onUpdate(payload.new as UserSyncSnapshotRow)
        }
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function flushPushAppData() {
  const userId = getActiveUserId()

  if (!userId || !isSupabaseConfigured() || isApplyingRemote) {
    return
  }

  if (pushDebounceId !== null) {
    window.clearTimeout(pushDebounceId)
    pushDebounceId = null
  }

  void pushRemoteSnapshot(userId, collectLocalSnapshot(userId)).catch((error) => {
    console.error("Failed to flush app data sync to Supabase", error)
  })
}

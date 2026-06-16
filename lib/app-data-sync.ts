import {
  clearLegacyAppLocalStorage,
  createEmptyCloudSnapshot,
  getCloudSnapshot,
  importLegacyLocalStorage,
  setCloudSnapshot,
  type CloudSnapshot,
} from "@/lib/cloud-store"
import type { PlannerDayState, RoutineRule } from "@/lib/planner"
import { DEFAULT_POMODORO_TIMER_VALUES } from "@/lib/pomodoro-timer"
import type { PomodoroSessionLog } from "@/lib/pomodoro-sessions"
import {
  fetchRemoteNotificationSettings,
  notificationSettingsDifferFromDefault,
  saveRemoteNotificationSettings,
} from "@/lib/notification-settings-sync"
import type { Reminder } from "@/lib/reminders"
import {
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_UPDATED_EVENT,
  type AppSettings,
  type NotificationSettings,
} from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { getActiveUserId } from "@/lib/user-storage"

export const APP_DATA_SYNCED_EVENT = "whim-app-data-synced"

const PUSH_DEBOUNCE_MS = 400

export type UserSyncSnapshot = CloudSnapshot

export type UserSyncSnapshotRow = {
  app_settings: AppSettings | null
  daily_update_marker: string | null
  notification_settings: NotificationSettings | null
  planner_state: Record<string, PlannerDayState> | null
  pomodoro_sessions_by_date: Record<string, PomodoroSessionLog[]> | null
  pomodoro_timer_defaults: CloudSnapshot["pomodoro_timer_defaults"] | null
  reminders: Reminder[] | null
  routines: RoutineRule[] | null
  updated_at: string
  user_id: string
}

let isApplyingRemote = false
let pushDebounceId: number | null = null
let pushInFlight: Promise<void> | null = null
let lastAppliedRemoteUpdatedAt: string | null = null
let lastPushedUpdatedAt: string | null = null

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

export function collectCloudSnapshot(): UserSyncSnapshot {
  return getCloudSnapshot() ?? createEmptyCloudSnapshot()
}

export function applyCloudSnapshot(snapshot: UserSyncSnapshot) {
  if (typeof window === "undefined") {
    return
  }

  if (!getActiveUserId()) {
    return
  }

  isApplyingRemote = true

  try {
    setCloudSnapshot(snapshot)
    lastAppliedRemoteUpdatedAt = snapshot.updated_at
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
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

function shouldApplyRemoteRow(row: UserSyncSnapshotRow) {
  if (isApplyingRemote) {
    return false
  }

  if (pushDebounceId !== null) {
    return false
  }

  if (row.updated_at && row.updated_at === lastAppliedRemoteUpdatedAt) {
    return false
  }

  if (row.updated_at && row.updated_at === lastPushedUpdatedAt) {
    return false
  }

  const memoryTime = Date.parse(getCloudSnapshot()?.updated_at || "0")
  const remoteTime = Date.parse(row.updated_at || "0")

  return remoteTime > memoryTime
}

export function applyRemoteSnapshotRow(row: UserSyncSnapshotRow) {
  if (!shouldApplyRemoteRow(row)) {
    return
  }

  applyCloudSnapshot(rowToSnapshot(row, null))
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

  if (error) {
    console.error(
      "[Whim Task sync] Could not read user_sync_snapshots:",
      error.message,
      "— Run supabase/setup-user-sync.sql in Supabase SQL Editor.",
    )
    return null
  }

  if (!data) {
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
  const updatedAt = new Date().toISOString()
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
    updated_at: updatedAt,
  }

  const { error } = await supabase
    .from("user_sync_snapshots")
    .upsert(payload, { onConflict: "user_id" })

  if (error) {
    console.error(
      "[Whim Task sync] Could not save tasks to Supabase:",
      error.message,
      "— Run supabase/setup-user-sync.sql in Supabase SQL Editor.",
    )
    throw new Error(error.message || "Could not save app data to Supabase.")
  }

  await saveRemoteNotificationSettings(userId, snapshot.app_settings.notifications)

  setCloudSnapshot({ ...snapshot, updated_at: updatedAt })
  lastPushedUpdatedAt = updatedAt
  lastAppliedRemoteUpdatedAt = updatedAt
}

export async function flushPushAppData() {
  const userId = getActiveUserId()

  if (!userId || !isSupabaseConfigured() || isApplyingRemote) {
    return
  }

  if (pushDebounceId === null && !pushInFlight) {
    return
  }

  if (pushDebounceId !== null) {
    window.clearTimeout(pushDebounceId)
    pushDebounceId = null
  }

  if (pushInFlight) {
    await pushInFlight
    return
  }

  pushInFlight = pushRemoteSnapshot(userId, collectCloudSnapshot())
    .catch((error) => {
      console.error("Failed to flush app data sync to Supabase", error)
    })
    .finally(() => {
      pushInFlight = null
    })

  await pushInFlight
}

export async function syncAppDataFromRemote(userId: string) {
  if (!isSupabaseConfigured()) {
    return
  }

  if (pushDebounceId !== null || pushInFlight) {
    await flushPushAppData()
  }

  const remoteSnapshot = await fetchRemoteSnapshot(userId)
  const memorySnapshot = getCloudSnapshot()

  if (!remoteSnapshot) {
    const legacySnapshot = importLegacyLocalStorage(userId)
    const snapshot =
      legacySnapshot ??
      memorySnapshot ??
      createEmptyCloudSnapshot(loadSettings() ?? DEFAULT_SETTINGS)

    applyCloudSnapshot(snapshot)

    if (snapshotHasData(snapshot)) {
      await pushRemoteSnapshot(userId, collectCloudSnapshot())
    }

    if (legacySnapshot) {
      clearLegacyAppLocalStorage(userId)
    }

    return
  }

  const memoryTime = Date.parse(memorySnapshot?.updated_at || "0")
  const remoteTime = Date.parse(remoteSnapshot.updated_at || "0")
  const remoteHasData = snapshotHasData(remoteSnapshot)
  const memoryHasData = memorySnapshot ? snapshotHasData(memorySnapshot) : false

  if (!memorySnapshot || (remoteHasData && remoteTime >= memoryTime)) {
    applyCloudSnapshot(remoteSnapshot)
  } else if (memoryHasData && memoryTime > remoteTime) {
    await pushRemoteSnapshot(userId, memorySnapshot)
  } else if (memoryHasData) {
    await pushRemoteSnapshot(userId, memorySnapshot)
  } else {
    applyCloudSnapshot(remoteSnapshot)
  }

  clearLegacyAppLocalStorage(userId)
}

export function schedulePushAppData() {
  if (isApplyingRemote || typeof window === "undefined") {
    return
  }

  const userId = getActiveUserId()

  if (!userId || !isSupabaseConfigured()) {
    return
  }

  if (pushDebounceId !== null) {
    window.clearTimeout(pushDebounceId)
  }

  pushDebounceId = window.setTimeout(() => {
    pushDebounceId = null

    pushInFlight = pushRemoteSnapshot(userId, collectCloudSnapshot())
      .catch((error) => {
        console.error("Failed to sync app data to Supabase", error)
      })
      .finally(() => {
        pushInFlight = null
      })
  }, PUSH_DEBOUNCE_MS)
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

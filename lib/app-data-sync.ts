import {
  clearLegacyAppLocalStorage,
  createEmptyCloudSnapshot,
  getCloudSnapshot,
  hasPendingLocalChanges,
  importLegacyLocalStorage,
  markPushCompleted,
  setCloudSnapshot,
  type CloudSnapshot,
} from "@/lib/cloud-store"
import { appStateHasRows, loadAppStateFromDb } from "@/lib/db/load-app-state"
import { subscribeToAppTables } from "@/lib/db/realtime"
import { syncAppStateToDb } from "@/lib/db/sync-app-state"
import type { PlannerDayState, RoutineRule } from "@/lib/planner"
import type { PomodoroSessionLog } from "@/lib/pomodoro-sessions"
import { notificationSettingsDifferFromDefault } from "@/lib/notification-settings-sync"
import type { Reminder } from "@/lib/reminders"
import {
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_UPDATED_EVENT,
  type AppSettings,
  type NotificationSettings,
} from "@/lib/settings"
import { getActiveUserId } from "@/lib/user-storage"

export const APP_DATA_SYNCED_EVENT = "whim-app-data-synced"
export const APP_DATA_HYDRATED_EVENT = "whim-app-data-hydrated"

const PUSH_DEBOUNCE_MS = 400
const REMOTE_REFRESH_DEBOUNCE_MS = 250

export type UserSyncSnapshot = CloudSnapshot

let isApplyingRemote = false
let pushDebounceId: number | null = null
let pushInFlight: Promise<void> | null = null
let remoteRefreshDebounceId: number | null = null
let remoteRefreshInFlight: Promise<void> | null = null
let isAppDataHydrated = false

function hasPlannerContent(state: Record<string, PlannerDayState>) {
  return Object.values(state).some(
    (day) =>
      day.tasks.length > 0 ||
      day.completed.length > 0 ||
      day.draft.trim().length > 0,
  )
}

export function getIsAppDataHydrated() {
  return isAppDataHydrated
}

function setAppDataHydrated(hydrated: boolean) {
  isAppDataHydrated = hydrated

  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent(APP_DATA_HYDRATED_EVENT, {
      detail: { hydrated },
    }),
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

  if (hasPendingLocalChanges()) {
    return
  }

  isApplyingRemote = true

  try {
    setCloudSnapshot(snapshot, { fromRemote: true })
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
  } finally {
    isApplyingRemote = false
  }

  window.dispatchEvent(new CustomEvent(APP_DATA_SYNCED_EVENT))
}

async function pushCloudSnapshotToDb(userId: string, snapshot: UserSyncSnapshot) {
  const updatedAt = await syncAppStateToDb(userId, snapshot)
  setCloudSnapshot({ ...snapshot, updated_at: updatedAt })
  markPushCompleted()
}

export async function flushPushAppData() {
  const userId = getActiveUserId()

  if (!userId || isApplyingRemote) {
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

  pushInFlight = pushCloudSnapshotToDb(userId, collectCloudSnapshot())
    .catch((error) => {
      console.error("Failed to flush app data sync to Supabase", error)
    })
    .finally(() => {
      pushInFlight = null
    })

  await pushInFlight
}

export async function refreshAppStateFromDb(userId: string) {
  if (
    isApplyingRemote ||
    pushDebounceId !== null ||
    pushInFlight ||
    hasPendingLocalChanges()
  ) {
    return
  }

  const remoteSnapshot = await loadAppStateFromDb(userId)

  if (!remoteSnapshot) {
    return
  }

  const memorySnapshot = getCloudSnapshot()
  const memoryTime = Date.parse(memorySnapshot?.updated_at || "0")
  const remoteTime = Date.parse(remoteSnapshot.updated_at || "0")

  if (!memorySnapshot || remoteTime >= memoryTime) {
    applyCloudSnapshot(remoteSnapshot)
  }
}

function scheduleRemoteRefresh(userId: string) {
  if (typeof window === "undefined" || isApplyingRemote) {
    return
  }

  if (pushDebounceId !== null || pushInFlight || hasPendingLocalChanges()) {
    return
  }

  if (remoteRefreshDebounceId !== null) {
    window.clearTimeout(remoteRefreshDebounceId)
  }

  remoteRefreshDebounceId = window.setTimeout(() => {
    remoteRefreshDebounceId = null

    if (remoteRefreshInFlight) {
      return
    }

    remoteRefreshInFlight = refreshAppStateFromDb(userId)
      .catch((error) => {
        console.error("Failed to refresh app state from Supabase", error)
      })
      .finally(() => {
        remoteRefreshInFlight = null
      })
  }, REMOTE_REFRESH_DEBOUNCE_MS)
}

export async function syncAppDataFromRemote(
  userId: string,
  options?: { isInitial?: boolean },
) {
  if (options?.isInitial) {
    setAppDataHydrated(false)
  }

  try {
    if (pushDebounceId !== null || pushInFlight) {
      await flushPushAppData()
    }

    const remoteSnapshot = await loadAppStateFromDb(userId)
    const memorySnapshot = getCloudSnapshot()

    if (!remoteSnapshot || !appStateHasRows(remoteSnapshot)) {
      const legacySnapshot = importLegacyLocalStorage(userId)
      const snapshot =
        legacySnapshot ??
        memorySnapshot ??
        createEmptyCloudSnapshot(loadSettings() ?? DEFAULT_SETTINGS)

      setCloudSnapshot(snapshot)
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))
      window.dispatchEvent(new CustomEvent(APP_DATA_SYNCED_EVENT))

      if (snapshotHasData(snapshot)) {
        await pushCloudSnapshotToDb(userId, collectCloudSnapshot())
      }

      if (legacySnapshot) {
        clearLegacyAppLocalStorage(userId)
      }

      return
    }

    const memoryTime = Date.parse(memorySnapshot?.updated_at || "0")
    const remoteTime = Date.parse(remoteSnapshot.updated_at || "0")
    const memoryHasData = memorySnapshot ? snapshotHasData(memorySnapshot) : false

    if (!memorySnapshot || remoteTime >= memoryTime) {
      applyCloudSnapshot(remoteSnapshot)
    } else if (memoryHasData) {
      await pushCloudSnapshotToDb(userId, memorySnapshot)
    } else {
      applyCloudSnapshot(remoteSnapshot)
    }

    clearLegacyAppLocalStorage(userId)
  } finally {
    if (options?.isInitial) {
      setAppDataHydrated(true)
    }
  }
}

export function schedulePushAppData() {
  if (isApplyingRemote || typeof window === "undefined") {
    return
  }

  const userId = getActiveUserId()

  if (!userId) {
    return
  }

  if (pushDebounceId !== null) {
    window.clearTimeout(pushDebounceId)
  }

  pushDebounceId = window.setTimeout(() => {
    pushDebounceId = null

    pushInFlight = pushCloudSnapshotToDb(userId, collectCloudSnapshot())
      .catch((error) => {
        console.error("Failed to sync app data to Supabase", error)
      })
      .finally(() => {
        pushInFlight = null
      })
  }, PUSH_DEBOUNCE_MS)
}

export function subscribeToRemoteAppState(
  userId: string,
  onUpdate: () => void,
) {
  return subscribeToAppTables(userId, () => {
    onUpdate()
    scheduleRemoteRefresh(userId)
  })
}

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

export function applyRemoteSnapshotRow(_row: UserSyncSnapshotRow) {
  const userId = getActiveUserId()

  if (!userId) {
    return
  }

  scheduleRemoteRefresh(userId)
}

export function subscribeToRemoteSnapshot(
  userId: string,
  onUpdate: (row: UserSyncSnapshotRow) => void,
) {
  return subscribeToRemoteAppState(userId, () => {
    onUpdate({
      user_id: userId,
      updated_at: new Date().toISOString(),
    } as UserSyncSnapshotRow)
  })
}

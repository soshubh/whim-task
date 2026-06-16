import { getCloudSnapshot, patchCloudSnapshot } from "@/lib/cloud-store"

export type NotificationSound = "default" | "soft" | "bell" | "none"

export type UserProfile = {
  avatar: string
  email: string
  name: string
}

export type DailyUpdateSettings = {
  enabled: boolean
  eveningEnabled: boolean
  eveningTime: string
  includeCompleted: boolean
  includeRemaining: boolean
  morningEnabled: boolean
  morningTime: string
}

export type NotificationSettings = {
  browserNotificationsEnabled: boolean
  dailyUpdate: DailyUpdateSettings
  sound: NotificationSound
}

export type AppSettings = {
  notifications: NotificationSettings
  profile: UserProfile
}

export const SETTINGS_STORAGE_KEY = "whim-task-settings"
export const SETTINGS_UPDATED_EVENT = "whim-settings-updated"

const DEFAULT_PROFILE: UserProfile = {
  name: "Shubh Singh",
  email: "shubh@whimtask.app",
  avatar: "",
}

const DEFAULT_DAILY_UPDATE: DailyUpdateSettings = {
  enabled: false,
  morningEnabled: true,
  morningTime: "08:00",
  eveningEnabled: true,
  eveningTime: "21:00",
  includeCompleted: true,
  includeRemaining: true,
}

export const DEFAULT_SETTINGS: AppSettings = {
  profile: DEFAULT_PROFILE,
  notifications: {
    browserNotificationsEnabled: false,
    sound: "default",
    dailyUpdate: DEFAULT_DAILY_UPDATE,
  },
}

function normalizeSettings(parsed: Partial<AppSettings> | undefined): AppSettings {
  if (!parsed || Object.keys(parsed).length === 0) {
    return DEFAULT_SETTINGS
  }

  return {
    profile: {
      ...DEFAULT_PROFILE,
      ...parsed.profile,
    },
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...parsed.notifications,
      dailyUpdate: {
        ...DEFAULT_DAILY_UPDATE,
        ...parsed.notifications?.dailyUpdate,
      },
    },
  }
}

export function loadSettings(): AppSettings {
  const snapshot = getCloudSnapshot()

  if (!snapshot) {
    return DEFAULT_SETTINGS
  }

  return normalizeSettings(snapshot.app_settings)
}

export function saveSettings(
  settings: AppSettings,
  options?: { skipCloudSync?: boolean },
) {
  if (typeof window === "undefined") {
    return
  }

  patchCloudSnapshot({
    app_settings: settings,
    notification_settings: settings.notifications,
  })
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT))

  if (options?.skipCloudSync) {
    return
  }

  import("@/lib/app-data-sync")
    .then(({ schedulePushAppData }) => {
      schedulePushAppData()
    })
    .catch(() => undefined)
}

export function areSettingsEqual(left: AppSettings, right: AppSettings) {
  return JSON.stringify(left) === JSON.stringify(right)
}

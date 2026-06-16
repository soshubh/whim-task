import {
  DEFAULT_SETTINGS,
  type NotificationSettings,
} from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

type NotificationSettingsRow = {
  browser_notifications_enabled: boolean
  daily_update_enabled: boolean
  evening_enabled: boolean
  evening_time: string
  include_completed: boolean
  include_remaining: boolean
  morning_enabled: boolean
  morning_time: string
  sound: NotificationSettings["sound"]
}

function normalizeTimeValue(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/)

  if (!match) {
    return "08:00:00"
  }

  const hours = `${Number.parseInt(match[1], 10)}`.padStart(2, "0")
  const minutes = match[2]

  return `${hours}:${minutes}:00`
}

function timeFromRow(value: string) {
  return value.slice(0, 5)
}

export function mapNotificationSettingsToRow(
  settings: NotificationSettings,
): NotificationSettingsRow {
  return {
    browser_notifications_enabled: settings.browserNotificationsEnabled,
    sound: settings.sound,
    daily_update_enabled: settings.dailyUpdate.enabled,
    morning_enabled: settings.dailyUpdate.morningEnabled,
    morning_time: normalizeTimeValue(settings.dailyUpdate.morningTime),
    evening_enabled: settings.dailyUpdate.eveningEnabled,
    evening_time: normalizeTimeValue(settings.dailyUpdate.eveningTime),
    include_completed: settings.dailyUpdate.includeCompleted,
    include_remaining: settings.dailyUpdate.includeRemaining,
  }
}

export function mapNotificationSettingsFromRow(
  row: NotificationSettingsRow,
): NotificationSettings {
  return {
    browserNotificationsEnabled: row.browser_notifications_enabled,
    sound: row.sound,
    dailyUpdate: {
      enabled: row.daily_update_enabled,
      morningEnabled: row.morning_enabled,
      morningTime: timeFromRow(row.morning_time),
      eveningEnabled: row.evening_enabled,
      eveningTime: timeFromRow(row.evening_time),
      includeCompleted: row.include_completed,
      includeRemaining: row.include_remaining,
    },
  }
}

export async function fetchRemoteNotificationSettings(
  userId: string,
): Promise<NotificationSettings | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("notification_settings")
    .select(
      "browser_notifications_enabled, sound, daily_update_enabled, morning_enabled, morning_time, evening_enabled, evening_time, include_completed, include_remaining",
    )
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return mapNotificationSettingsFromRow(data as NotificationSettingsRow)
}

export async function saveRemoteNotificationSettings(
  userId: string,
  settings: NotificationSettings,
) {
  if (!isSupabaseConfigured()) {
    return
  }

  const supabase = getSupabaseClient()
  const payload = {
    user_id: userId,
    ...mapNotificationSettingsToRow(settings),
  }

  const { error } = await supabase
    .from("notification_settings")
    .upsert(payload, { onConflict: "user_id" })

  if (error) {
    throw new Error(
      error.message || "Could not save notification settings to Supabase.",
    )
  }
}

export function notificationSettingsDifferFromDefault(
  settings: NotificationSettings,
) {
  return (
    JSON.stringify(settings) !==
    JSON.stringify(DEFAULT_SETTINGS.notifications)
  )
}

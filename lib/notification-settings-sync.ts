import { DEFAULT_SETTINGS, type NotificationSettings } from "@/lib/settings"

export function notificationSettingsDifferFromDefault(
  settings: NotificationSettings,
) {
  return (
    JSON.stringify(settings) !==
    JSON.stringify(DEFAULT_SETTINGS.notifications)
  )
}

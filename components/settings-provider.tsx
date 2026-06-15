"use client"

import * as React from "react"

import {
  getBrowserNotificationPermission,
  playNotificationSound,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/lib/browser-notifications"
import {
  buildDailyUpdateMessage,
  getActiveDailyUpdateSlot,
  getTodayTaskSummary,
  markDailyUpdateFired,
} from "@/lib/daily-updates"
import { useAuth } from "@/components/auth-provider"
import { usePlanner } from "@/components/planner-provider"
import { AUTH_UPDATED_EVENT } from "@/lib/auth"
import { saveRemoteProfile } from "@/lib/profile-sync"
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTINGS_UPDATED_EVENT,
  type AppSettings,
} from "@/lib/settings"

type CommitSettingsOptions = {
  avatarFile?: File | null
}

type SettingsContextValue = {
  browserPermission: ReturnType<typeof getBrowserNotificationPermission>
  closeSettings: () => void
  commitSettings: (
    next: AppSettings,
    options?: CommitSettingsOptions,
  ) => Promise<void>
  openSettings: () => void
  requestBrowserPermission: () => Promise<
    ReturnType<typeof getBrowserNotificationPermission>
  >
  settings: AppSettings
  settingsOpen: boolean
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const { plannerState, routines } = usePlanner()
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [browserPermission, setBrowserPermission] = React.useState(
    getBrowserNotificationPermission(),
  )

  React.useEffect(() => {
    setSettings(loadSettings())
    setBrowserPermission(getBrowserNotificationPermission())
  }, [])

  React.useEffect(() => {
    const refreshSettings = () => {
      setSettings(loadSettings())
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, refreshSettings)
    window.addEventListener(AUTH_UPDATED_EVENT, refreshSettings)

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, refreshSettings)
      window.removeEventListener(AUTH_UPDATED_EVENT, refreshSettings)
    }
  }, [])

  const commitSettings = React.useCallback(
    async (next: AppSettings, options?: CommitSettingsOptions) => {
      let profile = next.profile

      if (session?.userId) {
        const savedProfile = await saveRemoteProfile(session.userId, {
          name: next.profile.name,
          avatar: next.profile.avatar,
          avatarFile: options?.avatarFile,
        })

        profile = {
          ...next.profile,
          name: savedProfile.name,
          avatar: savedProfile.avatarUrl,
        }
      }

      const persisted: AppSettings = {
        ...next,
        profile,
      }

      setSettings(persisted)
      saveSettings(persisted)
    },
    [session?.userId],
  )

  const openSettings = React.useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const closeSettings = React.useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const requestBrowserPermission = React.useCallback(async () => {
    const permission = await requestBrowserNotificationPermission()
    setBrowserPermission(permission)
    return permission
  }, [])

  React.useEffect(() => {
    const tick = () => {
      const dailySettings = settings.notifications.dailyUpdate
      const slot = getActiveDailyUpdateSlot(dailySettings)

      if (!slot) {
        return
      }

      const summary = getTodayTaskSummary(plannerState, routines)
      const message = buildDailyUpdateMessage(summary, slot, dailySettings)

      if (settings.notifications.browserNotificationsEnabled) {
        showBrowserNotification({
          title: message.title,
          body: message.body,
          sound: settings.notifications.sound,
        })
      } else {
        playNotificationSound(settings.notifications.sound)
      }

      markDailyUpdateFired(slot)
    }

    tick()
    const intervalId = window.setInterval(tick, 30000)

    return () => window.clearInterval(intervalId)
  }, [plannerState, routines, settings.notifications])

  const value = React.useMemo(
    () => ({
      browserPermission,
      closeSettings,
      commitSettings,
      openSettings,
      requestBrowserPermission,
      settings,
      settingsOpen,
    }),
    [
      browserPermission,
      closeSettings,
      commitSettings,
      openSettings,
      requestBrowserPermission,
      settings,
      settingsOpen,
    ],
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = React.useContext(SettingsContext)

  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider")
  }

  return context
}

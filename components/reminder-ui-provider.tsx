"use client"

import * as React from "react"

import {
  getExistingReminderForTarget,
  ReminderPickerModal,
  type ReminderPickerTarget,
} from "@/components/reminder-picker-modal"
import { usePlanner } from "@/components/planner-provider"
import { useSettings } from "@/components/settings-provider"
import type { NotificationItem } from "@/lib/reminders"
import {
  playNotificationSound,
  showBrowserNotification,
} from "@/lib/browser-notifications"

type ReminderUiContextValue = {
  bellShaking: boolean
  closeNotifications: () => void
  dismissToast: (id: string) => void
  clearToasts: () => void
  handleReschedule: (reminderId: string) => void
  notificationCount: number
  notifications: NotificationItem[]
  notificationsOpen: boolean
  openNotifications: () => void
  openReminderPicker: (target: ReminderPickerTarget) => void
  toastNotifications: NotificationItem[]
}

const ReminderUiContext = React.createContext<ReminderUiContextValue | null>(
  null,
)

const TOAST_DURATION_MS = 5000

function getUnreadDueReminderIds(items: NotificationItem[]) {
  return items
    .filter((item) => item.isDue || item.status === "triggered")
    .map((item) => item.reminderId)
}

export function ReminderUiProvider({ children }: { children: React.ReactNode }) {
  const {
    dismissReminder,
    isPlannerReady,
    notifications,
    notificationCount,
    readReminders,
    reminders,
    rescheduleReminder,
    upsertRoutineReminder,
    upsertTaskReminder,
  } = usePlanner()
  const { settings } = useSettings()
  const [notificationsOpen, setNotificationsOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerTarget, setPickerTarget] =
    React.useState<ReminderPickerTarget | null>(null)
  const [bellShaking, setBellShaking] = React.useState(false)
  const [toastNotifications, setToastNotifications] = React.useState<
    NotificationItem[]
  >([])
  const isTrackingDueRef = React.useRef(false)
  const previousDueIdsRef = React.useRef<Set<string>>(new Set())

  const openNotifications = React.useCallback(() => {
    readReminders(getUnreadDueReminderIds(notifications))
    setNotificationsOpen(true)
  }, [notifications, readReminders])

  const closeNotifications = React.useCallback(() => {
    setNotificationsOpen(false)
  }, [])

  const openReminderPicker = React.useCallback((target: ReminderPickerTarget) => {
    setPickerTarget(target)
    setPickerOpen(true)
  }, [])

  const dismissToast = React.useCallback(
    (id: string) => {
      const item = toastNotifications.find((entry) => entry.id === id)

      if (item) {
        readReminders([item.reminderId])
      }

      setToastNotifications((current) => current.filter((entry) => entry.id !== id))
    },
    [readReminders, toastNotifications],
  )

  const clearToasts = React.useCallback(() => {
    setToastNotifications([])
  }, [])

  const handleReschedule = React.useCallback(
    (reminderId: string) => {
      const reminder = reminders.find((entry) => entry.id === reminderId)
      if (!reminder) {
        return
      }

      if (reminder.status === "triggered") {
        rescheduleReminder(reminderId)
      }

      if (reminder.kind === "task") {
        openReminderPicker({
          kind: "task",
          taskId: reminder.taskId,
          dateKey: reminder.dateKey,
          title: reminder.title,
        })
        return
      }

      openReminderPicker({
        kind: "routine",
        routineId: reminder.routineId,
        title: reminder.title,
      })
    },
    [openReminderPicker, reminders, rescheduleReminder],
  )

  const handleSaveReminder = React.useCallback(
    (values: { dateKey?: string; time: string }) => {
      if (!pickerTarget) {
        return
      }

      const existingReminder = getExistingReminderForTarget(
        reminders,
        pickerTarget,
      )

      if (pickerTarget.kind === "routine") {
        upsertRoutineReminder({
          id: existingReminder?.id,
          routineId: pickerTarget.routineId,
          title: pickerTarget.title,
          time: values.time,
        })
      } else {
        upsertTaskReminder({
          id: existingReminder?.id,
          taskId: pickerTarget.taskId,
          dateKey: values.dateKey ?? pickerTarget.dateKey,
          title: pickerTarget.title,
          time: values.time,
        })
      }

      setPickerOpen(false)
      setPickerTarget(null)
    },
    [pickerTarget, reminders, upsertRoutineReminder, upsertTaskReminder],
  )

  React.useEffect(() => {
    if (!isPlannerReady) {
      isTrackingDueRef.current = false
      previousDueIdsRef.current = new Set()
      return
    }

    const dueItems = notifications.filter(
      (item) => item.isDue || item.status === "triggered",
    )
    const currentDueIds = new Set(dueItems.map((item) => item.id))

    if (!isTrackingDueRef.current) {
      isTrackingDueRef.current = true
      previousDueIdsRef.current = currentDueIds
      return
    }

    const newDueItems = dueItems.filter((item) => {
      if (previousDueIdsRef.current.has(item.id)) {
        return false
      }

      const reminder = reminders.find((entry) => entry.id === item.reminderId)
      return !reminder?.readAt
    })

    if (newDueItems.length > 0) {
      readReminders(newDueItems.map((item) => item.reminderId))
      setBellShaking(true)
      setToastNotifications((current) => {
        const existingIds = new Set(current.map((item) => item.id))
        const nextToasts = newDueItems.filter((item) => !existingIds.has(item.id))

        return [...nextToasts, ...current].slice(0, 3)
      })

      if (settings.notifications.browserNotificationsEnabled) {
        for (const item of newDueItems) {
          showBrowserNotification({
            title: item.title,
            body: item.scheduledLabel,
            sound: settings.notifications.sound,
          })
        }
      } else if (settings.notifications.sound !== "none") {
        playNotificationSound(settings.notifications.sound)
      }

      const shakeTimeoutId = window.setTimeout(() => {
        setBellShaking(false)
      }, 620)

      previousDueIdsRef.current = currentDueIds

      return () => window.clearTimeout(shakeTimeoutId)
    }

    previousDueIdsRef.current = currentDueIds
  }, [
    isPlannerReady,
    notifications,
    readReminders,
    reminders,
    settings.notifications,
  ])

  React.useEffect(() => {
    if (toastNotifications.length === 0) {
      return
    }

    const timeoutIds = toastNotifications.map((item) =>
      window.setTimeout(() => {
        dismissToast(item.id)
      }, TOAST_DURATION_MS),
    )

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [dismissToast, toastNotifications])

  const value = React.useMemo(
    () => ({
      bellShaking,
      clearToasts,
      closeNotifications,
      dismissToast,
      handleReschedule,
      notificationCount,
      notifications,
      notificationsOpen,
      openNotifications,
      openReminderPicker,
      toastNotifications,
    }),
    [
      bellShaking,
      clearToasts,
      closeNotifications,
      dismissToast,
      handleReschedule,
      notificationCount,
      notifications,
      notificationsOpen,
      openNotifications,
      openReminderPicker,
      toastNotifications,
    ],
  )

  return (
    <ReminderUiContext.Provider value={value}>
      {children}
      <ReminderPickerModal
        existingReminder={getExistingReminderForTarget(reminders, pickerTarget)}
        onClose={() => {
          setPickerOpen(false)
          setPickerTarget(null)
        }}
        onSave={handleSaveReminder}
        open={pickerOpen}
        target={pickerTarget}
      />
    </ReminderUiContext.Provider>
  )
}

export function useReminderUi() {
  const context = React.useContext(ReminderUiContext)

  if (!context) {
    throw new Error("useReminderUi must be used within ReminderUiProvider")
  }

  return context
}

"use client"

import { NotificationToasts } from "@/components/notification-toasts"
import { NotificationsPanel } from "@/components/notifications-panel"
import { usePlanner } from "@/components/planner-provider"
import { useReminderUi } from "@/components/reminder-ui-provider"

export function NotificationsLayer() {
  const { dismissReminder } = usePlanner()
  const {
    closeNotifications,
    dismissToast,
    handleReschedule,
    notifications,
    notificationsOpen,
    toastNotifications,
  } = useReminderUi()

  return (
    <>
      <NotificationsPanel
        items={notifications}
        onClose={closeNotifications}
        onDismiss={dismissReminder}
        onReschedule={handleReschedule}
        open={notificationsOpen}
      />
      <NotificationToasts
        items={toastNotifications}
        onDismiss={dismissToast}
      />
    </>
  )
}

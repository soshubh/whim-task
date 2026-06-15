"use client"

import { Bell, Repeat, X } from "lucide-react"

import type { NotificationItem } from "@/lib/reminders"

type NotificationToastsProps = {
  items: NotificationItem[]
  onDismiss: (id: string) => void
}

export function NotificationToasts({
  items,
  onDismiss,
}: NotificationToastsProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div
      aria-label="New notifications"
      aria-live="polite"
      className="notification-toasts"
    >
      {items.map((item) => (
        <article className="notification-toast" key={item.id}>
          <div className="notification-toast__icon" aria-hidden="true">
            {item.kind === "routine" ? (
              <Repeat className="size-4" />
            ) : (
              <Bell className="size-4" />
            )}
          </div>
          <div className="notification-toast__copy">
            <strong>{item.title}</strong>
            <span className="notification-toast__message">{item.subtitle}</span>
            <span className="notification-toast__time">{item.scheduledLabel}</span>
          </div>
          <button
            aria-label={`Dismiss ${item.title}`}
            className="notification-toast__close"
            onClick={() => onDismiss(item.id)}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </article>
      ))}
    </div>
  )
}

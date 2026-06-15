"use client"

import * as React from "react"
import { Bell, Clock3, MoreHorizontal, Repeat } from "lucide-react"

import { ContentDrawer } from "@/components/content-drawer"
import type { NotificationItem } from "@/lib/reminders"

type NotificationsPanelProps = {
  items: NotificationItem[]
  onDismiss: (reminderId: string) => void
  onClose: () => void
  onReschedule: (reminderId: string) => void
  open: boolean
}

export function NotificationsPanel({
  items,
  onDismiss,
  onClose,
  onReschedule,
  open,
}: NotificationsPanelProps) {
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setOpenMenuId(null)
    }
  }, [open])

  React.useEffect(() => {
    if (!openMenuId) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      if (target.closest("[data-notification-menu]")) {
        return
      }

      setOpenMenuId(null)
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [openMenuId])

  const dueItems = items.filter((item) => item.isDue || item.status === "triggered")
  const upcomingItems = items.filter(
    (item) => !item.isDue && item.status === "scheduled",
  )

  return (
    <ContentDrawer
      ariaLabel="Notifications"
      onClose={onClose}
      open={open}
      title="Notifications"
      variant="notifications"
    >
      {items.length === 0 ? (
        <p className="content-drawer__empty content-drawer__empty--centered">
          There are no notifications
        </p>
      ) : (
        <>
          {dueItems.length > 0 ? (
            <section className="content-drawer__section">
              <h3 className="content-drawer__section-title">Due now</h3>
              <NotificationList
                items={dueItems}
                onDismiss={(reminderId) => {
                  setOpenMenuId(null)
                  onDismiss(reminderId)
                }}
                onReschedule={(reminderId) => {
                  setOpenMenuId(null)
                  onReschedule(reminderId)
                }}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                variant="due"
              />
            </section>
          ) : null}

          {upcomingItems.length > 0 ? (
            <section className="content-drawer__section">
              <h3 className="content-drawer__section-title">Upcoming</h3>
              <NotificationList
                items={upcomingItems}
                onDismiss={(reminderId) => {
                  setOpenMenuId(null)
                  onDismiss(reminderId)
                }}
                onReschedule={(reminderId) => {
                  setOpenMenuId(null)
                  onReschedule(reminderId)
                }}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                variant="upcoming"
              />
            </section>
          ) : null}
        </>
      )}
    </ContentDrawer>
  )
}

function NotificationList({
  items,
  onDismiss,
  onReschedule,
  openMenuId,
  setOpenMenuId,
  variant,
}: {
  items: NotificationItem[]
  onDismiss: (reminderId: string) => void
  onReschedule: (reminderId: string) => void
  openMenuId: string | null
  setOpenMenuId: React.Dispatch<React.SetStateAction<string | null>>
  variant: "due" | "upcoming"
}) {
  return (
    <div className="content-drawer__notification-group">
      {items.map((item, index) => (
        <NotificationRow
          isLastItem={index === items.length - 1}
          isMenuOpen={openMenuId === item.id}
          item={item}
          key={item.id}
          onDismiss={onDismiss}
          onReschedule={onReschedule}
          onToggleMenu={() =>
            setOpenMenuId((current) => (current === item.id ? null : item.id))
          }
          variant={variant}
        />
      ))}
    </div>
  )
}

function NotificationRow({
  isLastItem,
  isMenuOpen,
  item,
  onDismiss,
  onReschedule,
  onToggleMenu,
  variant,
}: {
  isLastItem: boolean
  isMenuOpen: boolean
  item: NotificationItem
  onDismiss: (reminderId: string) => void
  onReschedule: (reminderId: string) => void
  onToggleMenu: () => void
  variant: "due" | "upcoming"
}) {
  const isUpcoming = variant === "upcoming"
  const rescheduleLabel = isUpcoming ? "Reset reminder" : "Set again"

  return (
    <article
      className={`content-drawer__notification-item ${
        !isUpcoming ? "content-drawer__notification-item--due" : ""
      } ${isMenuOpen ? "content-drawer__notification-item--menu-open" : ""}`}
    >
      <div className="content-drawer__card-icon" aria-hidden="true">
        {item.kind === "routine" ? (
          <Repeat className="size-4" />
        ) : (
          <Bell className="size-4" />
        )}
      </div>

      <div className="content-drawer__card-copy">
        <strong>{item.title}</strong>
        <span className="content-drawer__card-message">{item.subtitle}</span>
        <span className="content-drawer__card-time">
          <Clock3 className="size-3.5" />
          {item.scheduledLabel}
        </span>
      </div>

      <div className="content-drawer__notification-menu-slot" data-notification-menu>
        <button
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label={`Actions for ${item.title}`}
          className="content-drawer__notification-menu-trigger"
          onClick={onToggleMenu}
          type="button"
        >
          <MoreHorizontal className="size-4" />
        </button>

        {isMenuOpen ? (
          <div
            className={`content-drawer__notification-menu ${
              isLastItem ? "content-drawer__notification-menu--above" : ""
            }`}
            role="menu"
          >
            <button
              className="content-drawer__notification-menu-item"
              onClick={() => onReschedule(item.reminderId)}
              role="menuitem"
              type="button"
            >
              {rescheduleLabel}
            </button>
            <button
              className="content-drawer__notification-menu-item"
              onClick={() => onDismiss(item.reminderId)}
              role="menuitem"
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

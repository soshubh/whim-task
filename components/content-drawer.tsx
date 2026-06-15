"use client"

import * as React from "react"
import { X } from "lucide-react"

export type ContentDrawerVariant = "notifications" | "settings"

type ContentDrawerProps = {
  actionBar?: React.ReactNode
  ariaLabel: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  open: boolean
  showActionBar?: boolean
  title: string
  variant: ContentDrawerVariant
}

export function ContentDrawer({
  actionBar,
  ariaLabel,
  children,
  footer,
  onClose,
  open,
  showActionBar = false,
  title,
  variant,
}: ContentDrawerProps) {
  return (
    <>
      <button
        aria-hidden={!open}
        className={`content-drawer__backdrop ${
          open ? "content-drawer__backdrop--open" : ""
        }`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        type="button"
      />
      <aside
        aria-hidden={!open}
        aria-label={ariaLabel}
        className={`content-drawer content-drawer--${variant} ${
          open ? "content-drawer--open" : ""
        }`}
      >
        <header className="content-drawer__header">
          <h2 className="content-drawer__title">{title}</h2>
          <button
            aria-label={`Close ${title.toLowerCase()}`}
            className="content-drawer__close"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="content-drawer__content">{children}</div>

        {actionBar ? (
          <div
            className={`content-drawer__action-bar ${
              showActionBar ? "content-drawer__action-bar--visible" : ""
            }`}
          >
            {actionBar}
          </div>
        ) : null}

        {footer ? <footer className="content-drawer__footer">{footer}</footer> : null}
      </aside>
    </>
  )
}

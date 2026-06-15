"use client"

import { MessageCircleMore, Search } from "lucide-react"

import styles from "./app-main-header.module.css"

type AppMainHeaderProps = {
  sectionLabel: string
  subtitle: string
  title: string
}

export function AppMainHeader({
  sectionLabel,
  subtitle,
  title,
}: AppMainHeaderProps) {
  return (
    <header className="app-main__header">
      <div className={styles.copy}>
        <p className={styles.sectionLabel}>{sectionLabel}</p>
        <h1 className={styles.greeting}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>

      <div className="app-main__actions">
        <button
          aria-label={`Search ${sectionLabel}`}
          className={styles.search}
          type="button"
        >
          <Search className="size-5" />
          <span>Search for health data</span>
        </button>

        <button className="app-main__feedback-button" type="button">
          <MessageCircleMore className="size-4" />
          <span>Feedback</span>
        </button>
      </div>
    </header>
  )
}

"use client"

import * as React from "react"

export function NotificationBadge({ count }: { count: number }) {
  const [displayCount, setDisplayCount] = React.useState(count)
  const [isAnimating, setIsAnimating] = React.useState(false)

  React.useEffect(() => {
    if (count === displayCount) {
      return
    }

    setIsAnimating(true)

    const timeoutId = window.setTimeout(() => {
      setDisplayCount(count)
      setIsAnimating(false)
    }, 220)

    return () => window.clearTimeout(timeoutId)
  }, [count, displayCount])

  if (count <= 0) {
    return null
  }

  const formatCount = (value: number) => (value > 9 ? "9+" : String(value))

  return (
    <span className="app-sidebar__badge" aria-hidden="true">
      {isAnimating ? (
        <>
          <span className="app-sidebar__badge-value app-sidebar__badge-value--exit">
            {formatCount(displayCount)}
          </span>
          <span className="app-sidebar__badge-value app-sidebar__badge-value--enter">
            {formatCount(count)}
          </span>
        </>
      ) : (
        <span className="app-sidebar__badge-value">{formatCount(count)}</span>
      )}
    </span>
  )
}

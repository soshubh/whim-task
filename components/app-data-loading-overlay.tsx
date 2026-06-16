"use client"

import * as React from "react"

import { useAuth } from "@/components/auth-provider"
import { usePlanner } from "@/components/planner-provider"
import {
  APP_DATA_HYDRATED_EVENT,
  getIsAppDataHydrated,
} from "@/lib/app-data-sync"

export function AppDataLoadingOverlay() {
  const { isLoading, session } = useAuth()
  const { isPlannerReady } = usePlanner()
  const [isHydrated, setIsHydrated] = React.useState(() => getIsAppDataHydrated())

  React.useEffect(() => {
    const syncHydration = () => {
      setIsHydrated(getIsAppDataHydrated())
    }

    syncHydration()
    window.addEventListener(APP_DATA_HYDRATED_EVENT, syncHydration)

    return () => {
      window.removeEventListener(APP_DATA_HYDRATED_EVENT, syncHydration)
    }
  }, [session?.userId])

  const showOverlay = Boolean(session) && (isLoading || !isHydrated || !isPlannerReady)

  if (!showOverlay) {
    return null
  }

  return (
    <div
      aria-busy="true"
      aria-label="Loading your workspace"
      aria-live="polite"
      className="app-data-loading-overlay"
      role="status"
    >
      <div className="app-data-loading-overlay__dots" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

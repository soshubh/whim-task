"use client"

import * as React from "react"

import { useAuth } from "@/components/auth-provider"
import {
  flushPushAppData,
  subscribeToRemoteAppState,
  syncAppDataFromRemote,
} from "@/lib/app-data-sync"

export function AppDataSyncProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { isLoading, session } = useAuth()

  React.useEffect(() => {
    if (isLoading || !session?.userId) {
      return
    }

    const unsubscribe = subscribeToRemoteAppState(session.userId, () => {
      // Realtime handler schedules a debounced DB refresh in app-data-sync.
    })

    return unsubscribe
  }, [isLoading, session?.userId])

  React.useEffect(() => {
    if (isLoading || !session?.userId) {
      return
    }

    const refreshFromCloud = () => {
      void syncAppDataFromRemote(session.userId)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromCloud()
      }
    }

    window.addEventListener("focus", refreshFromCloud)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", refreshFromCloud)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isLoading, session?.userId])

  React.useEffect(() => {
    const flushOnExit = () => {
      void flushPushAppData()
    }

    window.addEventListener("pagehide", flushOnExit)

    return () => {
      window.removeEventListener("pagehide", flushOnExit)
    }
  }, [])

  return children
}

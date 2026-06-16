"use client"

import { AuthProvider } from "@/components/auth-provider"
import { AppDataSyncProvider } from "@/components/app-data-sync-provider"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppDataSyncProvider>{children}</AppDataSyncProvider>
    </AuthProvider>
  )
}

"use client"

import { AuthProvider } from "@/components/auth-provider"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

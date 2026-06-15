"use client"

import * as React from "react"
import type { User } from "@supabase/supabase-js"

import {
  AUTH_UPDATED_EVENT,
  createAuthSession,
  deriveNameFromEmail,
  isValidEmail,
  normalizeEmail,
  type AuthSession,
} from "@/lib/auth"
import { formatAuthError } from "@/lib/auth-errors"
import {
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings"
import { getSupabaseClient } from "@/lib/supabase/client"
import {
  migrateLegacyStorageForUser,
  setActiveUserId,
} from "@/lib/user-storage"

type AuthContextValue = {
  isAuthenticated: boolean
  isLoading: boolean
  sendOtp: (email: string) => Promise<{ email: string; name: string }>
  session: AuthSession | null
  signOut: () => Promise<void>
  verifyOtp: (email: string, otp: string) => Promise<AuthSession>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function sessionFromUser(user: User): AuthSession {
  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null

  return createAuthSession({
    userId: user.id,
    email: user.email ?? "",
    name: metadataName,
  })
}

function syncProfileFromSession(session: AuthSession) {
  setActiveUserId(session.userId)
  migrateLegacyStorageForUser(session.userId, session.email)

  const current = loadSettings()
  const next: AppSettings = {
    ...current,
    profile: {
      ...current.profile,
      email: session.email,
      name: session.name,
    },
  }

  saveSettings(next)
}

function clearAuthenticatedStorageScope() {
  setActiveUserId(null)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const supabase = getSupabaseClient()

    const applySession = (nextSession: AuthSession | null) => {
      if (nextSession) {
        syncProfileFromSession(nextSession)
      } else {
        clearAuthenticatedStorageScope()
      }

      setSession(nextSession)
      window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT))
    }

    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      applySession(authSession?.user ? sessionFromUser(authSession.user) : null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      applySession(authSession?.user ? sessionFromUser(authSession.user) : null)
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const sendOtp = React.useCallback(async (email: string) => {
    const normalizedEmail = normalizeEmail(email)

    if (!isValidEmail(normalizedEmail)) {
      throw new Error("Enter a valid email address.")
    }

    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    })

    if (error) {
      throw new Error(
        formatAuthError(
          error,
          "Could not send one-time code. Check Supabase email settings.",
        ),
      )
    }

    return {
      email: normalizedEmail,
      name: deriveNameFromEmail(normalizedEmail),
    }
  }, [])

  const verifyOtp = React.useCallback(async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email)
    const token = otp.trim()

    if (!isValidEmail(normalizedEmail)) {
      throw new Error("Enter a valid email address.")
    }

    if (!/^\d{6,8}$/.test(token)) {
      throw new Error("Enter the code from your email.")
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: "email",
    })

    if (error) {
      throw new Error(
        formatAuthError(error, "Invalid or expired code. Request a new one."),
      )
    }

    if (!data.user) {
      throw new Error("Unable to verify one-time code.")
    }

    const nextSession = sessionFromUser(data.user)
    setSession(nextSession)
    syncProfileFromSession(nextSession)
    window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT))

    return nextSession
  }, [])

  const signOut = React.useCallback(async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    clearAuthenticatedStorageScope()
    setSession(null)
    window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT))
  }, [])

  const value = React.useMemo(
    () => ({
      isAuthenticated: Boolean(session),
      isLoading,
      sendOtp,
      session,
      signOut,
      verifyOtp,
    }),
    [isLoading, sendOtp, session, signOut, verifyOtp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}

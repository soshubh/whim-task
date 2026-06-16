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
import { clearCloudSnapshot } from "@/lib/cloud-store"
import { syncAppDataFromRemote } from "@/lib/app-data-sync"
import {
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchRemoteProfile } from "@/lib/profile-sync"
import { setActiveUserId } from "@/lib/user-storage"

type AuthContextValue = {
  configError: string | null
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

let profileSyncGeneration = 0

async function syncProfileFromSession(session: AuthSession) {
  const syncId = ++profileSyncGeneration

  setActiveUserId(session.userId)

  const current = loadSettings()
  const remote = await fetchRemoteProfile(session.userId)

  if (syncId !== profileSyncGeneration) {
    return
  }

  const next: AppSettings = {
    ...current,
    profile: {
      ...current.profile,
      email: session.email,
      name: remote?.name ?? (current.profile.name || session.name),
      avatar: remote?.avatarUrl ?? current.profile.avatar,
    },
  }

  saveSettings(next, { skipCloudSync: true })

  await syncAppDataFromRemote(session.userId)
}

function shouldSyncProfileFromAuthEvent(event: string) {
  return event === "SIGNED_IN" || event === "INITIAL_SESSION"
}

function clearAuthenticatedStorageScope() {
  setActiveUserId(null)
  clearCloudSnapshot()
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [configError, setConfigError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!isSupabaseConfigured()) {
      setConfigError(
        "Supabase is not configured for this deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.",
      )
      setIsLoading(false)
      return
    }

    const supabase = getSupabaseClient()

    const applySignedOutSession = () => {
      clearAuthenticatedStorageScope()
      setSession(null)
      window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT))
      setIsLoading(false)
    }

    const applySignedInSession = async (
      nextSession: AuthSession,
      syncProfile: boolean,
    ) => {
      if (syncProfile) {
        await syncProfileFromSession(nextSession)
      } else {
        setActiveUserId(nextSession.userId)
      }

      setSession(nextSession)
      window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT))
      setIsLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      if (!authSession?.user) {
        applySignedOutSession()
        return
      }

      void applySignedInSession(sessionFromUser(authSession.user), true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (!authSession?.user) {
        applySignedOutSession()
        return
      }

      void applySignedInSession(
        sessionFromUser(authSession.user),
        shouldSyncProfileFromAuthEvent(event),
      )
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const sendOtp = React.useCallback(async (email: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Auth is unavailable. Supabase environment variables are missing on the server.",
      )
    }

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
    if (!isSupabaseConfigured()) {
      throw new Error(
        "Auth is unavailable. Supabase environment variables are missing on the server.",
      )
    }

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
    await syncProfileFromSession(nextSession)
    setSession(nextSession)
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
      configError,
      isAuthenticated: Boolean(session),
      isLoading,
      sendOtp,
      session,
      signOut,
      verifyOtp,
    }),
    [configError, isLoading, sendOtp, session, signOut, verifyOtp],
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

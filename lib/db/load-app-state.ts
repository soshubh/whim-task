import {
  normalizeCloudSnapshot,
  type CloudSnapshot,
} from "@/lib/cloud-store"
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

type AppStateRow = {
  state: Partial<CloudSnapshot> | null
  updated_at: string
}

type ProfileRow = {
  avatar_url: string | null
  email: string
  name: string
}

function buildSettingsFromProfile(
  profile: ProfileRow | null,
  snapshot: CloudSnapshot,
): AppSettings {
  if (!profile) {
    return snapshot.app_settings
  }

  return {
    ...snapshot.app_settings,
    profile: {
      ...snapshot.app_settings.profile,
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar_url ?? "",
    },
  }
}

export async function loadAppStateFromDb(
  userId: string,
): Promise<CloudSnapshot | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const supabase = getSupabaseClient()
  const [stateResult, profileResult] = await Promise.all([
    supabase
      .from("app_state")
      .select("state, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("name, email, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
  ])

  if (stateResult.error) {
    console.error("[Whim Task sync] Could not load app state:", stateResult.error.message)
    return null
  }

  if (profileResult.error) {
    console.error("[Whim Task sync] Could not load profile:", profileResult.error.message)
  }

  if (!stateResult.data) {
    return null
  }

  const row = stateResult.data as AppStateRow
  const snapshot = normalizeCloudSnapshot({
    ...(row.state ?? {}),
    updated_at: row.updated_at,
  })
  const appSettings = buildSettingsFromProfile(
    (profileResult.data ?? null) as ProfileRow | null,
    snapshot,
  )

  return normalizeCloudSnapshot({
    ...snapshot,
    app_settings: appSettings,
    notification_settings: appSettings.notifications,
    updated_at: row.updated_at,
  })
}

export function appStateHasRows(snapshot: CloudSnapshot) {
  return (
    snapshot.routines.length > 0 ||
    snapshot.reminders.length > 0 ||
    Object.keys(snapshot.planner_state).length > 0 ||
    snapshot.task_dump_state.items.length > 0 ||
    snapshot.task_dump_state.completed.length > 0 ||
    Object.values(snapshot.pomodoro_sessions_by_date).some((logs) => logs.length > 0) ||
    JSON.stringify(snapshot.app_settings.notifications) !==
      JSON.stringify(DEFAULT_SETTINGS.notifications)
  )
}

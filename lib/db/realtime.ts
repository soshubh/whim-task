import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

const REALTIME_TABLES = [
  "routines",
  "planner_days",
  "planner_tasks",
  "reminders",
  "notification_settings",
  "pomodoro_timer_settings",
  "pomodoro_sessions",
  "daily_update_logs",
  "profiles",
] as const

export function subscribeToAppTables(
  userId: string,
  onChange: () => void,
) {
  if (!isSupabaseConfigured()) {
    return () => undefined
  }

  const supabase = getSupabaseClient()
  let channel = supabase.channel(`whim-app:${userId}`)

  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: table === "profiles" ? `id=eq.${userId}` : `user_id=eq.${userId}`,
      },
      () => {
        onChange()
      },
    )
  }

  channel.subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

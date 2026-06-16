import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

export function subscribeToAppTables(
  userId: string,
  onChange: () => void,
) {
  if (!isSupabaseConfigured()) {
    return () => undefined
  }

  const supabase = getSupabaseClient()
  let channel = supabase.channel(`whim-app:${userId}`)

  channel = channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_state",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        onChange()
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${userId}`,
      },
      () => {
        onChange()
      },
    )

  channel.subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

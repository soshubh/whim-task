import type { CloudSnapshot } from "@/lib/cloud-store"
import { normalizeCloudSnapshot } from "@/lib/cloud-store"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

export async function syncAppStateToDb(
  userId: string,
  snapshot: CloudSnapshot,
): Promise<string> {
  if (!isSupabaseConfigured()) {
    return snapshot.updated_at
  }

  const supabase = getSupabaseClient()
  const updatedAt = new Date().toISOString()
  const state = normalizeCloudSnapshot({
    ...snapshot,
    updated_at: updatedAt,
  })

  const { error } = await supabase
    .from("app_state")
    .upsert(
      {
        user_id: userId,
        state,
        updated_at: updatedAt,
      },
      { onConflict: "user_id" },
    )

  if (error) {
    throw new Error(error.message)
  }

  return updatedAt
}

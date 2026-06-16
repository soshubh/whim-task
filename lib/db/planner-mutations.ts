import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"

export async function deletePlannerTaskFromDb(taskId: string) {
  if (!isSupabaseConfigured()) {
    return
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.from("planner_tasks").delete().eq("id", taskId)

  if (error) {
    console.error("[Whim Task sync] Could not delete planner task:", error.message)
  }
}

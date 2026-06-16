import type { CloudSnapshot } from "@/lib/cloud-store"
import type { PlannerTask } from "@/lib/planner"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  mapNotificationSettingsToRow,
  parseDailyUpdateMarker,
  pomodoroTimerToRow,
  reminderToRow,
  routineToRow,
} from "@/lib/db/mappers"

function taskToRow(
  userId: string,
  dayId: string,
  task: PlannerTask,
  status: "active" | "completed",
  sortOrder: number,
) {
  return {
    id: task.id,
    user_id: userId,
    day_id: dayId,
    title: task.title,
    source: task.source,
    routine_id: task.routineId ?? null,
    status,
    sort_order: sortOrder,
  }
}

export async function syncAppStateToDb(
  userId: string,
  snapshot: CloudSnapshot,
): Promise<string> {
  if (!isSupabaseConfigured()) {
    return snapshot.updated_at
  }

  const supabase = getSupabaseClient()
  const updatedAt = new Date().toISOString()

  const routineRows = snapshot.routines.map((routine) => ({
    ...routineToRow(userId, routine),
    user_id: userId,
  }))

  const { data: existingRoutines, error: existingRoutinesError } = await supabase
    .from("routines")
    .select("id")
    .eq("user_id", userId)

  if (existingRoutinesError) {
    throw new Error(existingRoutinesError.message)
  }

  const routineIds = new Set(snapshot.routines.map((routine) => routine.id))
  const routineIdsToDelete =
    existingRoutines
      ?.map((row) => row.id as string)
      .filter((id) => !routineIds.has(id)) ?? []

  if (routineRows.length > 0) {
    const { error } = await supabase.from("routines").upsert(routineRows, {
      onConflict: "id",
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  if (routineIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("routines")
      .delete()
      .in("id", routineIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }

  const dayIdByDateKey = new Map<string, string>()
  const taskRows: ReturnType<typeof taskToRow>[] = []

  for (const [dateKey, day] of Object.entries(snapshot.planner_state)) {
    const { data: dayRow, error: dayError } = await supabase
      .from("planner_days")
      .upsert(
        {
          user_id: userId,
          date_key: dateKey,
          draft: day.draft,
          is_adding: day.isAdding,
          show_completed: day.showCompleted,
        },
        { onConflict: "user_id,date_key" },
      )
      .select("id, date_key")
      .single()

    if (dayError || !dayRow) {
      throw new Error(dayError?.message || "Could not save planner day.")
    }

    dayIdByDateKey.set(dateKey, dayRow.id as string)

    let sortOrder = 0
    for (const task of day.tasks) {
      taskRows.push(
        taskToRow(userId, dayRow.id as string, task, "active", sortOrder),
      )
      sortOrder += 1
    }

    for (const task of day.completed) {
      taskRows.push(
        taskToRow(userId, dayRow.id as string, task, "completed", sortOrder),
      )
      sortOrder += 1
    }
  }

  const { data: existingTasks, error: existingTasksError } = await supabase
    .from("planner_tasks")
    .select("id")
    .eq("user_id", userId)

  if (existingTasksError) {
    throw new Error(existingTasksError.message)
  }

  const taskIds = new Set(taskRows.map((row) => row.id))
  const taskIdsToDelete =
    existingTasks
      ?.map((row) => row.id as string)
      .filter((id) => !taskIds.has(id)) ?? []

  if (taskRows.length > 0) {
    const { error } = await supabase.from("planner_tasks").upsert(taskRows, {
      onConflict: "id",
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  if (taskIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("planner_tasks")
      .delete()
      .in("id", taskIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }

  const { data: existingDays, error: existingDaysError } = await supabase
    .from("planner_days")
    .select("id, date_key")
    .eq("user_id", userId)

  if (existingDaysError) {
    throw new Error(existingDaysError.message)
  }

  const dayKeys = new Set(Object.keys(snapshot.planner_state))
  const dayIdsToDelete =
    existingDays
      ?.filter((row) => !dayKeys.has(row.date_key as string))
      .map((row) => row.id as string) ?? []

  if (dayIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("planner_days")
      .delete()
      .in("id", dayIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }

  const reminderRows = snapshot.reminders.map((reminder) => ({
    ...reminderToRow(userId, reminder),
    user_id: userId,
  }))

  const { data: existingReminders, error: existingRemindersError } =
    await supabase.from("reminders").select("id").eq("user_id", userId)

  if (existingRemindersError) {
    throw new Error(existingRemindersError.message)
  }

  const reminderIds = new Set(snapshot.reminders.map((reminder) => reminder.id))
  const reminderIdsToDelete =
    existingReminders
      ?.map((row) => row.id as string)
      .filter((id) => !reminderIds.has(id)) ?? []

  if (reminderRows.length > 0) {
    const { error } = await supabase.from("reminders").upsert(reminderRows, {
      onConflict: "id",
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  if (reminderIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("reminders")
      .delete()
      .in("id", reminderIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }

  const { error: notificationError } = await supabase
    .from("notification_settings")
    .upsert(
      {
        user_id: userId,
        ...mapNotificationSettingsToRow(snapshot.app_settings.notifications),
      },
      { onConflict: "user_id" },
    )

  if (notificationError) {
    throw new Error(notificationError.message)
  }

  const { error: pomodoroTimerError } = await supabase
    .from("pomodoro_timer_settings")
    .upsert(pomodoroTimerToRow(userId, snapshot.pomodoro_timer_defaults), {
      onConflict: "user_id",
    })

  if (pomodoroTimerError) {
    throw new Error(pomodoroTimerError.message)
  }

  const sessionRows = Object.entries(snapshot.pomodoro_sessions_by_date).flatMap(
    ([dateKey, logs]) =>
      logs.map((log) => ({
        id: log.id,
        user_id: userId,
        date_key: dateKey,
        task_id: log.taskId,
        task_title: log.taskTitle,
        duration_seconds: log.durationSeconds,
      })),
  )

  const { data: existingSessions, error: existingSessionsError } =
    await supabase.from("pomodoro_sessions").select("id").eq("user_id", userId)

  if (existingSessionsError) {
    throw new Error(existingSessionsError.message)
  }

  const sessionIds = new Set(sessionRows.map((row) => row.id))
  const sessionIdsToDelete =
    existingSessions
      ?.map((row) => row.id as string)
      .filter((id) => !sessionIds.has(id)) ?? []

  if (sessionRows.length > 0) {
    const { error } = await supabase.from("pomodoro_sessions").upsert(sessionRows, {
      onConflict: "id",
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  if (sessionIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("pomodoro_sessions")
      .delete()
      .in("id", sessionIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }

  const marker = parseDailyUpdateMarker(snapshot.daily_update_marker)

  if (marker) {
    const { error } = await supabase.from("daily_update_logs").upsert(
      {
        user_id: userId,
        date_key: marker.date_key,
        slot: marker.slot,
      },
      { onConflict: "user_id,date_key,slot" },
    )

    if (error) {
      throw new Error(error.message)
    }
  }

  return updatedAt
}

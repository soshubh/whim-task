import type { CloudSnapshot } from "@/lib/cloud-store"
import { countPlannerTasks, type PlannerTask } from "@/lib/planner"
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

async function deleteTasksRemovedFromDay(
  dayId: string,
  keepTaskIds: Set<string>,
) {
  const supabase = getSupabaseClient()
  const { data: existingTasks, error } = await supabase
    .from("planner_tasks")
    .select("id")
    .eq("day_id", dayId)

  if (error) {
    throw new Error(error.message)
  }

  const taskIdsToDelete =
    existingTasks
      ?.map((row) => row.id as string)
      .filter((id) => !keepTaskIds.has(id)) ?? []

  if (taskIdsToDelete.length === 0) {
    return
  }

  const { error: deleteError } = await supabase
    .from("planner_tasks")
    .delete()
    .in("id", taskIdsToDelete)

  if (deleteError) {
    throw new Error(deleteError.message)
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

  const plannerTaskCount = countPlannerTasks(snapshot.planner_state)

  if (plannerTaskCount > 0) {
    for (const [dateKey, day] of Object.entries(snapshot.planner_state)) {
      const { data: dayRow, error: dayError } = await supabase
        .from("planner_days")
        .upsert(
          {
            user_id: userId,
            date_key: dateKey,
            draft: "",
            is_adding: false,
            show_completed: day.showCompleted,
          },
          { onConflict: "user_id,date_key" },
        )
        .select("id, date_key")
        .single()

      if (dayError || !dayRow) {
        throw new Error(dayError?.message || "Could not save planner day.")
      }

      let sortOrder = 0
      const keepTaskIds = new Set<string>()
      const dayTaskRows: ReturnType<typeof taskToRow>[] = []

      for (const task of day.tasks) {
        dayTaskRows.push(
          taskToRow(userId, dayRow.id as string, task, "active", sortOrder),
        )
        keepTaskIds.add(task.id)
        sortOrder += 1
      }

      for (const task of day.completed) {
        dayTaskRows.push(
          taskToRow(userId, dayRow.id as string, task, "completed", sortOrder),
        )
        keepTaskIds.add(task.id)
        sortOrder += 1
      }

      if (dayTaskRows.length > 0) {
        const { error } = await supabase.from("planner_tasks").upsert(dayTaskRows, {
          onConflict: "id",
        })

        if (error) {
          throw new Error(error.message)
        }
      }

      if (keepTaskIds.size > 0) {
        await deleteTasksRemovedFromDay(dayRow.id as string, keepTaskIds)
      }
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
      onConflict: "user_id" },
    )

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

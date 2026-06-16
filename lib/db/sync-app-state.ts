import type { CloudSnapshot } from "@/lib/cloud-store"
import type { PlannerDayState, PlannerTask } from "@/lib/planner"
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

function shouldPersistPlannerDay(day: PlannerDayState) {
  return (
    day.tasks.length > 0 ||
    day.completed.length > 0 ||
    day.draft.trim().length > 0 ||
    day.isAdding ||
    day.showCompleted
  )
}

async function syncPlannerState(
  userId: string,
  snapshot: CloudSnapshot,
) {
  const supabase = getSupabaseClient()
  const persistedDays = Object.entries(snapshot.planner_state).filter(([, day]) =>
    shouldPersistPlannerDay(day),
  )

  const dayRows = persistedDays.map(([dateKey, day]) => ({
    user_id: userId,
    date_key: dateKey,
    draft: day.draft,
    is_adding: day.isAdding,
    show_completed: day.showCompleted,
  }))

  let syncedDayRows: Array<{ date_key: string; id: string }> = []

  if (dayRows.length > 0) {
    const { data, error } = await supabase
      .from("planner_days")
      .upsert(dayRows, { onConflict: "user_id,date_key" })
      .select("id, date_key")

    if (error) {
      throw new Error(error.message)
    }

    syncedDayRows = (data ?? []) as Array<{ date_key: string; id: string }>
  }

  const keepDateKeys = new Set(dayRows.map((row) => row.date_key))

  if (keepDateKeys.size > 0) {
    const { data: existingDays, error: existingDaysError } = await supabase
      .from("planner_days")
      .select("date_key")
      .eq("user_id", userId)

    if (existingDaysError) {
      throw new Error(existingDaysError.message)
    }

    const dateKeysToDelete =
      existingDays
        ?.map((row) => row.date_key as string)
        .filter((dateKey) => !keepDateKeys.has(dateKey)) ?? []

    if (dateKeysToDelete.length > 0) {
      const { error } = await supabase
        .from("planner_days")
        .delete()
        .eq("user_id", userId)
        .in("date_key", dateKeysToDelete)

      if (error) {
        throw new Error(error.message)
      }
    }
  } else {
    const { error } = await supabase.from("planner_days").delete().eq("user_id", userId)

    if (error) {
      throw new Error(error.message)
    }
  }

  const dayIdByDateKey = new Map(
    syncedDayRows.map((row) => [row.date_key, row.id]),
  )
  const plannerTaskRows: Array<ReturnType<typeof taskToRow>> = []
  const keepTaskIds = new Set<string>()

  for (const [dateKey, day] of persistedDays) {
    const dayId = dayIdByDateKey.get(dateKey)

    if (!dayId) {
      continue
    }

    let sortOrder = 0

    for (const task of day.tasks) {
      plannerTaskRows.push(taskToRow(userId, dayId, task, "active", sortOrder))
      keepTaskIds.add(task.id)
      sortOrder += 1
    }

    for (const task of day.completed) {
      plannerTaskRows.push(taskToRow(userId, dayId, task, "completed", sortOrder))
      keepTaskIds.add(task.id)
      sortOrder += 1
    }
  }

  if (plannerTaskRows.length > 0) {
    const { error } = await supabase.from("planner_tasks").upsert(plannerTaskRows, {
      onConflict: "id",
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  const { data: existingTasks, error: existingTasksError } = await supabase
    .from("planner_tasks")
    .select("id")
    .eq("user_id", userId)

  if (existingTasksError) {
    throw new Error(existingTasksError.message)
  }

  const taskIdsToDelete =
    existingTasks
      ?.map((row) => row.id as string)
      .filter((id) => !keepTaskIds.has(id)) ?? []

  if (taskIdsToDelete.length > 0) {
    const { error } = await supabase
      .from("planner_tasks")
      .delete()
      .in("id", taskIdsToDelete)

    if (error) {
      throw new Error(error.message)
    }
  }
}

async function syncRoutines(userId: string, snapshot: CloudSnapshot) {
  const supabase = getSupabaseClient()
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

  const keepRoutineIds = new Set(snapshot.routines.map((routine) => routine.id))
  const routineIdsToDelete =
    existingRoutines
      ?.map((row) => row.id as string)
      .filter((id) => !keepRoutineIds.has(id)) ?? []

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
}

async function syncReminders(userId: string, snapshot: CloudSnapshot) {
  const supabase = getSupabaseClient()
  const reminderRows = snapshot.reminders.map((reminder) => ({
    ...reminderToRow(userId, reminder),
    user_id: userId,
  }))

  const { data: existingReminders, error: existingRemindersError } =
    await supabase.from("reminders").select("id").eq("user_id", userId)

  if (existingRemindersError) {
    throw new Error(existingRemindersError.message)
  }

  const keepReminderIds = new Set(snapshot.reminders.map((reminder) => reminder.id))
  const reminderIdsToDelete =
    existingReminders
      ?.map((row) => row.id as string)
      .filter((id) => !keepReminderIds.has(id)) ?? []

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
}

async function syncPomodoroSessions(userId: string, snapshot: CloudSnapshot) {
  const supabase = getSupabaseClient()
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

  const keepSessionIds = new Set(sessionRows.map((row) => row.id))
  const sessionIdsToDelete =
    existingSessions
      ?.map((row) => row.id as string)
      .filter((id) => !keepSessionIds.has(id)) ?? []

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

  await syncRoutines(userId, snapshot)
  await syncPlannerState(userId, snapshot)
  await syncReminders(userId, snapshot)

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

  await syncPomodoroSessions(userId, snapshot)

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

import { parseTimeValue } from "@/lib/reminders"
import type { DailyUpdateSettings } from "@/lib/settings"
import {
  getPendingTasksForDay,
  getDayState,
  stripTime,
  toDateKey,
  type PlannerDayState,
  type RoutineRule,
} from "@/lib/planner"

import {
  readScopedItem,
  writeScopedItem,
} from "@/lib/user-storage"
import { schedulePushAppData } from "@/lib/app-data-sync"

export type DailyTaskSummary = {
  added: number
  completed: number
  remaining: number
}

export type DailyUpdateSlot = "morning" | "evening"

const LAST_DAILY_UPDATE_KEY = "whim-task-last-daily-update"

export function getTodayTaskSummary(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  referenceDate = new Date(),
): DailyTaskSummary {
  const date = stripTime(referenceDate)
  const dateKey = toDateKey(date)
  const dayState = getDayState(plannerState, dateKey)
  const pending = getPendingTasksForDay(plannerState, routines, date)

  return {
    completed: dayState.completed.length,
    remaining: pending.length,
    added: dayState.tasks.length + dayState.completed.length,
  }
}

export function buildDailyUpdateMessage(
  summary: DailyTaskSummary,
  slot: DailyUpdateSlot,
  settings: DailyUpdateSettings,
) {
  const parts: string[] = []

  if (settings.includeCompleted) {
    parts.push(`${summary.completed} task${summary.completed === 1 ? "" : "s"} completed`)
  }

  if (settings.includeRemaining) {
    parts.push(`${summary.remaining} task${summary.remaining === 1 ? "" : "s"} left`)
  }

  const body =
    parts.length > 0
      ? parts.join(" · ")
      : `${summary.added} task${summary.added === 1 ? "" : "s"} on your planner today`

  const title =
    slot === "morning" ? "Morning daily update" : "End of day daily update"

  return { body, title }
}

export function isDailyUpdateDue(
  slot: DailyUpdateSlot,
  time: string,
  referenceDate = new Date(),
) {
  const { hours, minutes } = parseTimeValue(time)
  return (
    referenceDate.getHours() === hours &&
    referenceDate.getMinutes() === minutes
  )
}

export function hasDailyUpdateFired(
  slot: DailyUpdateSlot,
  referenceDate = new Date(),
) {
  if (typeof window === "undefined") {
    return false
  }

  const dateKey = toDateKey(stripTime(referenceDate))
  const marker = `${dateKey}:${slot}`
  return readScopedItem(LAST_DAILY_UPDATE_KEY) === marker
}

export function markDailyUpdateFired(
  slot: DailyUpdateSlot,
  referenceDate = new Date(),
) {
  if (typeof window === "undefined") {
    return
  }

  const dateKey = toDateKey(stripTime(referenceDate))
  writeScopedItem(LAST_DAILY_UPDATE_KEY, `${dateKey}:${slot}`)
  schedulePushAppData()
}

export function getActiveDailyUpdateSlot(
  settings: DailyUpdateSettings,
  referenceDate = new Date(),
): DailyUpdateSlot | null {
  if (!settings.enabled) {
    return null
  }

  if (
    settings.morningEnabled &&
    isDailyUpdateDue("morning", settings.morningTime, referenceDate) &&
    !hasDailyUpdateFired("morning", referenceDate)
  ) {
    return "morning"
  }

  if (
    settings.eveningEnabled &&
    isDailyUpdateDue("evening", settings.eveningTime, referenceDate) &&
    !hasDailyUpdateFired("evening", referenceDate)
  ) {
    return "evening"
  }

  return null
}

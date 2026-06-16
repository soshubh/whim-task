import { patchCloudSnapshot, getCloudSnapshot } from "@/lib/cloud-store"
import {
  fromDateKey,
  matchesRoutineDate,
  stripTime,
  toDateKey,
  type RoutineRule,
} from "@/lib/planner"

export type ReminderStatus = "scheduled" | "triggered" | "dismissed"

export type TaskReminder = {
  createdAt: string
  dateKey: string
  id: string
  kind: "task"
  scheduledAt: string
  status: ReminderStatus
  taskId: string
  time: string
  title: string
}

export type RoutineReminder = {
  createdAt: string
  id: string
  kind: "routine"
  lastTriggeredDateKey?: string
  routineId: string
  status: ReminderStatus
  time: string
  title: string
}

export type Reminder = TaskReminder | RoutineReminder

export type NotificationItem = {
  id: string
  isDue: boolean
  kind: "task" | "routine"
  reminderId: string
  scheduledAt: string
  scheduledLabel: string
  status: ReminderStatus
  subtitle: string
  title: string
}

export function getReminderMessage(kind: NotificationItem["kind"]) {
  return kind === "routine"
    ? "Reminder for this routine"
    : "Reminder for this task"
}

export const REMINDERS_STORAGE_KEY = "whim-task-reminders"
export const REMINDERS_UPDATED_EVENT = "whim-reminders-updated"

export function createReminderId() {
  return `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function parseTimeValue(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  }
}

export function buildScheduledAt(dateKey: string, time: string) {
  const { hours, minutes } = parseTimeValue(time)
  const date = fromDateKey(dateKey)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

export function formatReminderTimeLabel(time: string) {
  const { hours, minutes } = parseTimeValue(time)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function formatReminderDateTimeLabel(dateKey: string, time: string) {
  const date = fromDateKey(dateKey)
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)

  return `${dateLabel} at ${formatReminderTimeLabel(time)}`
}

export function loadReminders(): Reminder[] {
  return getCloudSnapshot()?.reminders ?? []
}

export function saveReminders(reminders: Reminder[]) {
  if (typeof window === "undefined") {
    return
  }

  patchCloudSnapshot({ reminders })
  window.dispatchEvent(
    new CustomEvent(REMINDERS_UPDATED_EVENT, {
      detail: { count: reminders.length },
    }),
  )
}

export function createSampleReminders(referenceDate = new Date()): Reminder[] {
  const today = stripTime(referenceDate)
  const todayKey = toDateKey(today)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = toDateKey(tomorrow)

  return [
    {
      id: createReminderId(),
      kind: "task",
      taskId: "sample-task-standup",
      dateKey: todayKey,
      title: "Standup and inbox reset",
      time: "09:00",
      scheduledAt: buildScheduledAt(todayKey, "09:00"),
      status: "triggered",
      createdAt: new Date().toISOString(),
    },
    {
      id: createReminderId(),
      kind: "task",
      taskId: "sample-task-review",
      dateKey: todayKey,
      title: "Review design feedback",
      time: "14:30",
      scheduledAt: buildScheduledAt(todayKey, "14:30"),
      status: "scheduled",
      createdAt: new Date().toISOString(),
    },
    {
      id: createReminderId(),
      kind: "routine",
      routineId: "sample-routine-focus",
      title: "Morning focus block",
      time: "08:15",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    },
    {
      id: createReminderId(),
      kind: "task",
      taskId: "sample-task-plan",
      dateKey: tomorrowKey,
      title: "Plan tomorrow",
      time: "18:00",
      scheduledAt: buildScheduledAt(tomorrowKey, "18:00"),
      status: "scheduled",
      createdAt: new Date().toISOString(),
    },
  ]
}

export function getRoutineReminderDueDateKey(
  reminder: RoutineReminder,
  routines: RoutineRule[],
  referenceDate = new Date(),
) {
  const routine = routines.find((entry) => entry.id === reminder.routineId)
  if (!routine || reminder.status === "dismissed") {
    return null
  }

  const today = stripTime(referenceDate)
  const startOffset = reminder.lastTriggeredDateKey ? 1 : 0

  for (let offset = startOffset; offset < 45; offset += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)

    if (!matchesRoutineDate(routine, date)) {
      continue
    }

    const dateKey = toDateKey(date)
    const scheduledAt = buildScheduledAt(dateKey, reminder.time)
    if (new Date(scheduledAt).getTime() <= referenceDate.getTime()) {
      return dateKey
    }

    return dateKey
  }

  return null
}

export function isTaskReminderDue(
  reminder: TaskReminder,
  referenceDate = new Date(),
) {
  if (reminder.status !== "scheduled") {
    return false
  }

  return new Date(reminder.scheduledAt).getTime() <= referenceDate.getTime()
}

export function isRoutineReminderDue(
  reminder: RoutineReminder,
  routines: RoutineRule[],
  referenceDate = new Date(),
) {
  if (reminder.status !== "scheduled") {
    return false
  }

  const dueDateKey = getRoutineReminderDueDateKey(
    reminder,
    routines,
    referenceDate,
  )
  if (!dueDateKey) {
    return false
  }

  const scheduledAt = buildScheduledAt(dueDateKey, reminder.time)
  return new Date(scheduledAt).getTime() <= referenceDate.getTime()
}

export function processDueReminders(
  reminders: Reminder[],
  routines: RoutineRule[],
  referenceDate = new Date(),
) {
  let changed = false

  const nextReminders = reminders.map((reminder) => {
    if (reminder.kind === "task") {
      if (!isTaskReminderDue(reminder, referenceDate)) {
        return reminder
      }

      changed = true
      return {
        ...reminder,
        status: "triggered" as const,
      }
    }

    if (!isRoutineReminderDue(reminder, routines, referenceDate)) {
      return reminder
    }

    const dueDateKey = getRoutineReminderDueDateKey(
      reminder,
      routines,
      referenceDate,
    )

    changed = true
    return {
      ...reminder,
      status: "triggered" as const,
      lastTriggeredDateKey: dueDateKey ?? reminder.lastTriggeredDateKey,
    }
  })

  return changed ? nextReminders : reminders
}

export function buildNotificationFeed(
  reminders: Reminder[],
  routines: RoutineRule[],
  referenceDate = new Date(),
): NotificationItem[] {
  const items: NotificationItem[] = []

  for (const reminder of reminders) {
    if (reminder.status === "dismissed") {
      continue
    }

    if (reminder.kind === "task") {
      const scheduledLabel = formatReminderDateTimeLabel(
        reminder.dateKey,
        reminder.time,
      )
      const isDue =
        reminder.status === "triggered" ||
        isTaskReminderDue(reminder, referenceDate)

      items.push({
        id: `task-${reminder.id}`,
        reminderId: reminder.id,
        kind: "task",
        title: reminder.title,
        subtitle: getReminderMessage("task"),
        status: reminder.status,
        scheduledAt: reminder.scheduledAt,
        scheduledLabel,
        isDue,
      })
      continue
    }

    const dueDateKey =
      getRoutineReminderDueDateKey(reminder, routines, referenceDate) ??
      reminder.lastTriggeredDateKey ??
      toDateKey(referenceDate)
    const scheduledAt = buildScheduledAt(dueDateKey, reminder.time)
    const isDue =
      reminder.status === "triggered" ||
      isRoutineReminderDue(reminder, routines, referenceDate)

    items.push({
      id: `routine-${reminder.id}`,
      reminderId: reminder.id,
      kind: "routine",
      title: reminder.title,
      subtitle: getReminderMessage("routine"),
      status: reminder.status,
      scheduledAt,
      scheduledLabel: formatReminderDateTimeLabel(dueDateKey, reminder.time),
      isDue,
    })
  }

  return items.sort((left, right) => {
    if (left.isDue !== right.isDue) {
      return left.isDue ? -1 : 1
    }

    if (left.status === "triggered" && right.status !== "triggered") {
      return -1
    }

    return (
      new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
    )
  })
}

export function countActiveNotifications(
  reminders: Reminder[],
  routines: RoutineRule[],
  referenceDate = new Date(),
) {
  return buildNotificationFeed(reminders, routines, referenceDate).filter(
    (item) => item.isDue || item.status === "triggered",
  ).length
}

export function findReminderForTask(reminders: Reminder[], taskId: string) {
  return reminders.find(
    (reminder) => reminder.kind === "task" && reminder.taskId === taskId,
  )
}

export function findReminderForRoutine(reminders: Reminder[], routineId: string) {
  return reminders.find(
    (reminder) =>
      reminder.kind === "routine" && reminder.routineId === routineId,
  )
}

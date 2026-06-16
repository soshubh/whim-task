import { DEFAULT_POMODORO_TIMER_VALUES } from "@/lib/pomodoro-timer"
import {
  readScopedItem,
  writeScopedItem,
} from "@/lib/user-storage"
import { schedulePushAppData } from "@/lib/app-data-sync"

export type PomodoroSessionLog = {
  durationSeconds: number
  id: string
  taskId: string
  taskTitle: string
}

export function getFocusSessionsStorageKey(dateKey: string) {
  return `whim-task-pomodoro-sessions-${dateKey}`
}

export function getPomodoroSessionLogKey(dateKey: string) {
  return `whim-task-pomodoro-session-log-${dateKey}`
}

export function loadPomodoroSessionLogs(dateKey: string): PomodoroSessionLog[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const stored = readScopedItem(getPomodoroSessionLogKey(dateKey))

    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored) as PomodoroSessionLog[]

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.taskId === "string" &&
        typeof entry.taskTitle === "string" &&
        typeof entry.durationSeconds === "number",
    )
  } catch {
    return []
  }
}

export function savePomodoroSessionLogs(
  dateKey: string,
  logs: PomodoroSessionLog[],
) {
  if (typeof window === "undefined") {
    return
  }

  writeScopedItem(getPomodoroSessionLogKey(dateKey), JSON.stringify(logs))
  writeScopedItem(getFocusSessionsStorageKey(dateKey), `${logs.length}`)
  window.dispatchEvent(
    new CustomEvent("whim-pomodoro-sessions-updated", {
      detail: { dateKey },
    }),
  )
  schedulePushAppData()
}

export function getElapsedFocusSeconds(
  sessionTotalSeconds: number,
  secondsRemaining: number,
) {
  if (sessionTotalSeconds > 0) {
    return Math.max(1, sessionTotalSeconds - secondsRemaining)
  }

  return 1
}

export function addPomodoroSessionLog(
  dateKey: string,
  entry: Pick<PomodoroSessionLog, "durationSeconds" | "taskId" | "taskTitle">,
) {
  const nextLogs = [
    ...loadPomodoroSessionLogs(dateKey),
    {
      ...entry,
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  ]

  savePomodoroSessionLogs(dateKey, nextLogs)
  return nextLogs
}

export function loadFocusSessionCount(dateKey: string) {
  if (typeof window === "undefined") {
    return 0
  }

  const stored = readScopedItem(getFocusSessionsStorageKey(dateKey))
  return stored ? Number.parseInt(stored, 10) || 0 : 0
}

export function getTotalFocusSeconds(
  logs: PomodoroSessionLog[],
  sessionCount: number,
) {
  if (logs.length > 0) {
    return logs.reduce((total, log) => total + log.durationSeconds, 0)
  }

  return sessionCount * DEFAULT_POMODORO_TIMER_VALUES.focus
}

export function formatPomodoroDuration(totalSeconds: number) {
  const total = Math.max(0, Math.round(totalSeconds))

  if (total <= 0) {
    return "0 sec"
  }

  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  if (hours > 0) {
    if (seconds === 0) {
      return `${hours} hr ${minutes} min`
    }

    return `${hours} hr ${minutes} min ${seconds} sec`
  }

  if (minutes > 0 && seconds > 0) {
    return `${minutes} min ${seconds} sec`
  }

  if (minutes > 0) {
    return `${minutes} min`
  }

  return `${seconds} sec`
}

export function formatPomodoroSessionDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60

  return `${minutes}:${`${remainder}`.padStart(2, "0")}`
}

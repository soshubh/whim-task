import {
  readScopedJson,
  writeScopedJson,
} from "@/lib/user-storage"
import { schedulePushAppData } from "@/lib/app-data-sync"

export type PomodoroTimerMode = "focus" | "short-break" | "long-break"

export type PomodoroTimerDefaults = Record<PomodoroTimerMode, number>

export const POMODORO_TIMER_LABELS: Record<PomodoroTimerMode, string> = {
  focus: "Focus",
  "short-break": "Short Break",
  "long-break": "Long Break",
}

export const DEFAULT_POMODORO_TIMER_VALUES: PomodoroTimerDefaults = {
  focus: 25 * 60,
  "short-break": 5 * 60,
  "long-break": 15 * 60,
}

const STORAGE_KEY = "whim-task-pomodoro-timer-defaults"

function isTimerMode(value: string): value is PomodoroTimerMode {
  return value === "focus" || value === "short-break" || value === "long-break"
}

export function loadPomodoroTimerDefaults(): PomodoroTimerDefaults {
  if (typeof window === "undefined") {
    return DEFAULT_POMODORO_TIMER_VALUES
  }

  try {
    const parsed = readScopedJson<Partial<Record<string, number>>>(
      STORAGE_KEY,
      {},
    )
    const nextDefaults = { ...DEFAULT_POMODORO_TIMER_VALUES }

    for (const [key, value] of Object.entries(parsed)) {
      if (!isTimerMode(key) || typeof value !== "number" || value <= 0) {
        continue
      }

      nextDefaults[key] = Math.round(value)
    }

    return nextDefaults
  } catch {
    return DEFAULT_POMODORO_TIMER_VALUES
  }
}

export function savePomodoroTimerDefaults(defaults: PomodoroTimerDefaults) {
  if (typeof window === "undefined") {
    return
  }

  writeScopedJson(STORAGE_KEY, defaults)
  schedulePushAppData()
}

export function minutesToSeconds(minutes: number) {
  return Math.max(1, Math.round(minutes)) * 60
}

export function secondsToMinutes(seconds: number) {
  return Math.round(seconds / 60)
}

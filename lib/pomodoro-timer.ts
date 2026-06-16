import { getCloudSnapshot, patchCloudSnapshot } from "@/lib/cloud-store"
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

function isTimerMode(value: string): value is PomodoroTimerMode {
  return value === "focus" || value === "short-break" || value === "long-break"
}

export function loadPomodoroTimerDefaults(): PomodoroTimerDefaults {
  const stored = getCloudSnapshot()?.pomodoro_timer_defaults
  const nextDefaults = { ...DEFAULT_POMODORO_TIMER_VALUES }

  if (!stored) {
    return nextDefaults
  }

  for (const [key, value] of Object.entries(stored)) {
    if (!isTimerMode(key) || typeof value !== "number" || value <= 0) {
      continue
    }

    nextDefaults[key] = Math.round(value)
  }

  return nextDefaults
}

export function savePomodoroTimerDefaults(defaults: PomodoroTimerDefaults) {
  if (typeof window === "undefined") {
    return
  }

  patchCloudSnapshot({ pomodoro_timer_defaults: defaults })
  schedulePushAppData()
}

export function minutesToSeconds(minutes: number) {
  return Math.max(1, Math.round(minutes)) * 60
}

export function secondsToMinutes(seconds: number) {
  return Math.round(seconds / 60)
}

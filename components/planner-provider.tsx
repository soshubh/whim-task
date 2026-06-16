"use client"

import * as React from "react"

import { useAuth } from "@/components/auth-provider"
import {
  buildNotificationFeed,
  buildScheduledAt,
  countActiveNotifications,
  createReminderId,
  loadReminders,
  processDueReminders,
  REMINDERS_UPDATED_EVENT,
  saveReminders,
  type NotificationItem,
  type Reminder,
  type RoutineReminder,
  type TaskReminder,
} from "@/lib/reminders"
import {
  createInitialPlannerState,
  createEmptyDayState,
  type PlannerDayState,
  type RoutineRule,
} from "@/lib/planner"
import {
  readScopedJson,
  writeScopedJson,
} from "@/lib/user-storage"
import {
  APP_DATA_SYNCED_EVENT,
  schedulePushAppData,
} from "@/lib/app-data-sync"

const STORAGE_KEY = "whim-task-planner-state"
const ROUTINES_KEY = "whim-task-routines"

type PlannerContextValue = {
  dismissReminder: (reminderId: string) => void
  notificationCount: number
  notifications: NotificationItem[]
  plannerState: Record<string, PlannerDayState>
  reminders: Reminder[]
  removeRemindersForRoutine: (routineId: string) => void
  removeRemindersForTask: (taskId: string) => void
  rescheduleReminder: (reminderId: string) => void
  routines: RoutineRule[]
  setPlannerState: React.Dispatch<
    React.SetStateAction<Record<string, PlannerDayState>>
  >
  setRoutines: React.Dispatch<React.SetStateAction<RoutineRule[]>>
  updateDay: (
    dateKey: string,
    updater: (day: PlannerDayState) => PlannerDayState,
  ) => void
  upsertRoutineReminder: (input: {
    id?: string
    routineId: string
    time: string
    title: string
  }) => void
  upsertTaskReminder: (input: {
    dateKey: string
    id?: string
    taskId: string
    time: string
    title: string
  }) => void
}

const PlannerContext = React.createContext<PlannerContextValue | null>(null)

function loadPlannerState() {
  if (typeof window === "undefined") {
    return createInitialPlannerState()
  }

  try {
    const stored = readScopedJson<Record<string, PlannerDayState>>(
      STORAGE_KEY,
      {},
    )

    if (!stored || Object.keys(stored).length === 0) {
      return createInitialPlannerState()
    }

    return stored
  } catch {
    return createInitialPlannerState()
  }
}

function loadRoutines() {
  if (typeof window === "undefined") {
    return []
  }

  try {
    return readScopedJson<RoutineRule[]>(ROUTINES_KEY, [])
  } catch {
    return []
  }
}

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, session } = useAuth()
  const [plannerState, setPlannerState] = React.useState(() =>
    createInitialPlannerState(),
  )
  const [routines, setRoutines] = React.useState<RoutineRule[]>([])
  const [reminders, setReminders] = React.useState<Reminder[]>([])
  const [isStorageHydrated, setIsStorageHydrated] = React.useState(false)

  React.useEffect(() => {
    if (isLoading) {
      return
    }

    if (!session) {
      setIsStorageHydrated(false)
      setPlannerState(createInitialPlannerState())
      setRoutines([])
      setReminders([])
      return
    }

    setPlannerState(loadPlannerState())
    setRoutines(loadRoutines())
    setReminders(loadReminders())
    setIsStorageHydrated(true)
  }, [isLoading, session?.userId])

  React.useEffect(() => {
    const refreshFromStorage = () => {
      if (!session) {
        setPlannerState(createInitialPlannerState())
        setRoutines([])
        setReminders([])
        return
      }

      setPlannerState(loadPlannerState())
      setRoutines(loadRoutines())
      setReminders(loadReminders())
    }

    window.addEventListener(APP_DATA_SYNCED_EVENT, refreshFromStorage)

    return () => {
      window.removeEventListener(APP_DATA_SYNCED_EVENT, refreshFromStorage)
    }
  }, [session?.userId])

  React.useEffect(() => {
    if (!session || !isStorageHydrated) {
      return
    }

    writeScopedJson(STORAGE_KEY, plannerState)
    schedulePushAppData()
  }, [plannerState, session?.userId, isStorageHydrated])

  React.useEffect(() => {
    if (!session || !isStorageHydrated) {
      return
    }

    writeScopedJson(ROUTINES_KEY, routines)
    schedulePushAppData()
  }, [routines, session?.userId, isStorageHydrated])

  React.useEffect(() => {
    if (!session || !isStorageHydrated) {
      return
    }

    saveReminders(reminders)
    schedulePushAppData()
  }, [reminders, session?.userId, isStorageHydrated])

  React.useEffect(() => {
    const refreshReminders = () => {
      if (!session) {
        setReminders([])
        return
      }

      setReminders(loadReminders())
    }

    window.addEventListener(REMINDERS_UPDATED_EVENT, refreshReminders)

    return () => {
      window.removeEventListener(REMINDERS_UPDATED_EVENT, refreshReminders)
    }
  }, [session?.userId])

  React.useEffect(() => {
    const tick = () => {
      setReminders((current) => processDueReminders(current, routines))
    }

    tick()
    const intervalId = window.setInterval(tick, 30000)

    return () => window.clearInterval(intervalId)
  }, [routines])

  const notifications = React.useMemo(
    () => buildNotificationFeed(reminders, routines),
    [reminders, routines],
  )

  const notificationCount = React.useMemo(
    () => countActiveNotifications(reminders, routines),
    [reminders, routines],
  )

  const updateDay = React.useCallback(
    (
      dateKey: string,
      updater: (day: PlannerDayState) => PlannerDayState,
    ) => {
      setPlannerState((current) => ({
        ...current,
        [dateKey]: updater(current[dateKey] ?? createEmptyDayState()),
      }))
    },
    [],
  )

  const upsertTaskReminder = React.useCallback(
    (input: {
      dateKey: string
      id?: string
      taskId: string
      time: string
      title: string
    }) => {
      setReminders((current) => {
        const nextReminder: TaskReminder = {
          id: input.id ?? createReminderId(),
          kind: "task",
          taskId: input.taskId,
          dateKey: input.dateKey,
          title: input.title,
          time: input.time,
          scheduledAt: buildScheduledAt(input.dateKey, input.time),
          status: "scheduled",
          createdAt: new Date().toISOString(),
        }

        const existingIndex = current.findIndex(
          (reminder) =>
            reminder.kind === "task" && reminder.taskId === input.taskId,
        )

        if (existingIndex === -1) {
          return [...current, nextReminder]
        }

        return current.map((reminder, index) =>
          index === existingIndex ? nextReminder : reminder,
        )
      })
    },
    [],
  )

  const upsertRoutineReminder = React.useCallback(
    (input: {
      id?: string
      routineId: string
      time: string
      title: string
    }) => {
      setReminders((current) => {
        const nextReminder: RoutineReminder = {
          id: input.id ?? createReminderId(),
          kind: "routine",
          routineId: input.routineId,
          title: input.title,
          time: input.time,
          status: "scheduled",
          createdAt: new Date().toISOString(),
        }

        const existingIndex = current.findIndex(
          (reminder) =>
            reminder.kind === "routine" &&
            reminder.routineId === input.routineId,
        )

        if (existingIndex === -1) {
          return [...current, nextReminder]
        }

        return current.map((reminder, index) =>
          index === existingIndex ? nextReminder : reminder,
        )
      })
    },
    [],
  )

  const dismissReminder = React.useCallback((reminderId: string) => {
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === reminderId
          ? { ...reminder, status: "dismissed" as const }
          : reminder,
      ),
    )
  }, [])

  const rescheduleReminder = React.useCallback((reminderId: string) => {
    setReminders((current) =>
      current.map((reminder) =>
        reminder.id === reminderId
          ? {
              ...reminder,
              status: "scheduled" as const,
              ...(reminder.kind === "routine"
                ? { lastTriggeredDateKey: undefined }
                : {}),
            }
          : reminder,
      ),
    )
  }, [])

  const removeRemindersForTask = React.useCallback((taskId: string) => {
    setReminders((current) =>
      current.filter(
        (reminder) => !(reminder.kind === "task" && reminder.taskId === taskId),
      ),
    )
  }, [])

  const removeRemindersForRoutine = React.useCallback((routineId: string) => {
    setReminders((current) =>
      current.filter(
        (reminder) =>
          !(reminder.kind === "routine" && reminder.routineId === routineId),
      ),
    )
  }, [])

  const value = React.useMemo(
    () => ({
      plannerState,
      routines,
      reminders,
      notifications,
      notificationCount,
      setPlannerState,
      setRoutines,
      updateDay,
      upsertTaskReminder,
      upsertRoutineReminder,
      dismissReminder,
      rescheduleReminder,
      removeRemindersForTask,
      removeRemindersForRoutine,
    }),
    [
      plannerState,
      routines,
      reminders,
      notifications,
      notificationCount,
      updateDay,
      upsertTaskReminder,
      upsertRoutineReminder,
      dismissReminder,
      rescheduleReminder,
      removeRemindersForTask,
      removeRemindersForRoutine,
    ],
  )

  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  )
}

export function usePlanner() {
  const context = React.useContext(PlannerContext)

  if (!context) {
    throw new Error("usePlanner must be used within PlannerProvider")
  }

  return context
}

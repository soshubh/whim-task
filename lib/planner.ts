export type PlannerTask = {
  id: string
  routineId?: string
  source: "manual" | "routine" | "dump"
  title: string
}

export type PlannerDayState = {
  completed: PlannerTask[]
  draft: string
  isAdding: boolean
  showCompleted: boolean
  tasks: PlannerTask[]
}

export type RoutineFrequency = "daily" | "weekly" | "bi-weekly" | "monthly"

export type RoutineRule = {
  createdDateKey: string
  frequency: RoutineFrequency
  id: string
  monthDates: number[]
  title: string
  weekDays: number[]
}

const WEEK_DAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const

export function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

export function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function createTask(
  title: string,
  source: PlannerTask["source"],
): PlannerTask {
  return {
    id: `${source}-${Math.random().toString(36).slice(2, 9)}`,
    source,
    title,
  }
}

export function createEmptyDayState(): PlannerDayState {
  return {
    tasks: [],
    completed: [],
    draft: "",
    isAdding: false,
    showCompleted: false,
  }
}

export function createInitialPlannerState(referenceDate = new Date()) {
  const today = stripTime(referenceDate)

  return {
    [toDateKey(addDays(today, -1))]: createEmptyDayState(),
    [toDateKey(today)]: createEmptyDayState(),
    [toDateKey(addDays(today, 1))]: createEmptyDayState(),
  } satisfies Record<string, PlannerDayState>
}

function diffInWeeks(start: Date, end: Date) {
  const milliseconds = Math.abs(end.getTime() - start.getTime())
  return Math.floor(milliseconds / (1000 * 60 * 60 * 24 * 7))
}

export function matchesRoutineDate(routine: RoutineRule, date: Date) {
  if (routine.frequency === "daily") {
    return true
  }

  if (routine.frequency === "weekly") {
    return routine.weekDays.includes(date.getDay())
  }

  if (routine.frequency === "bi-weekly") {
    if (!routine.weekDays.includes(date.getDay())) {
      return false
    }

    const start = fromDateKey(routine.createdDateKey)
    return Math.abs(diffInWeeks(start, date)) % 2 === 0
  }

  return routine.monthDates.includes(date.getDate())
}

export function getDayState(
  plannerState: Record<string, PlannerDayState>,
  dateKey: string,
) {
  return plannerState[dateKey] ?? createEmptyDayState()
}

function mergeTaskList(remote: PlannerTask[], local: PlannerTask[]) {
  const merged = new Map<string, PlannerTask>()

  for (const task of remote) {
    merged.set(task.id, task)
  }

  for (const task of local) {
    merged.set(task.id, task)
  }

  return Array.from(merged.values())
}

export function countPlannerTasks(plannerState: Record<string, PlannerDayState>) {
  return Object.values(plannerState).reduce(
    (total, day) => total + day.tasks.length + day.completed.length,
    0,
  )
}

export function mergePlannerState(
  local: Record<string, PlannerDayState>,
  remote: Record<string, PlannerDayState>,
) {
  const dateKeys = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
  ])
  const merged: Record<string, PlannerDayState> = {}

  for (const dateKey of dateKeys) {
    const localDay = local[dateKey] ?? createEmptyDayState()
    const remoteDay = remote[dateKey] ?? createEmptyDayState()

    if (localDay.isAdding) {
      merged[dateKey] = localDay
      continue
    }

    merged[dateKey] = {
      tasks: mergeTaskList(remoteDay.tasks, localDay.tasks),
      completed: mergeTaskList(remoteDay.completed, localDay.completed),
      draft: "",
      isAdding: false,
      showCompleted: remoteDay.showCompleted || localDay.showCompleted,
    }
  }

  return merged
}

export function getPendingTasksForDay(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  date: Date,
) {
  const dateKey = toDateKey(date)
  const dayState = getDayState(plannerState, dateKey)
  const completedIds = new Set(dayState.completed.map((task) => task.id))
  const routineTasks = routines
    .filter((routine) => matchesRoutineDate(routine, date))
    .map((routine) => ({
      id: `${routine.id}-${dateKey}`,
      title: routine.title,
      source: "routine" as const,
      routineId: routine.id,
    }))

  const seen = new Set<string>()

  return [...routineTasks, ...dayState.tasks]
    .filter((task) => !completedIds.has(task.id))
    .filter((task) => {
      if (seen.has(task.id)) {
        return false
      }

      seen.add(task.id)
      return true
    })
}

export function getCompletedTasksForDay(
  plannerState: Record<string, PlannerDayState>,
  date: Date,
) {
  return getDayState(plannerState, toDateKey(date)).completed
}

export function countRoutinesForDay(routines: RoutineRule[], date: Date) {
  return routines.filter((routine) => matchesRoutineDate(routine, date)).length
}

export function isDayFullyCompleted(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  date: Date,
) {
  const completedCount = getDayState(plannerState, toDateKey(date)).completed.length
  const pendingCount = getPendingTasksForDay(plannerState, routines, date).length
  return completedCount > 0 && pendingCount === 0
}

export function getLifetimeTaskStats(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
) {
  let totalCreated = 0
  let totalCompleted = 0

  for (const dateKey of Object.keys(plannerState)) {
    const date = fromDateKey(dateKey)
    const dayState = getDayState(plannerState, dateKey)
    const pending = getPendingTasksForDay(plannerState, routines, date)

    totalCompleted += dayState.completed.length
    totalCreated += dayState.completed.length + pending.length
  }

  const percent =
    totalCreated > 0 ? Math.round((totalCompleted / totalCreated) * 100) : 0

  return {
    percent,
    totalCompleted,
    totalCreated,
  }
}

export function getPreviousPendingTasks(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  beforeDate: Date,
) {
  const beforeKey = toDateKey(beforeDate)
  const entries = Object.entries(plannerState)
    .filter(([dateKey]) => dateKey < beforeKey)
    .sort(([left], [right]) => right.localeCompare(left))

  return entries.flatMap(([dateKey, dayState]) => {
    const date = fromDateKey(dateKey)
    const completedIds = new Set(dayState.completed.map((task) => task.id))
    const routineTasks = routines
      .filter((routine) => matchesRoutineDate(routine, date))
      .map((routine) => ({
        id: `${routine.id}-${dateKey}`,
        title: routine.title,
        source: "routine" as const,
        routineId: routine.id,
      }))
    const pending = [...routineTasks, ...dayState.tasks].filter(
      (task) => !completedIds.has(task.id),
    )

    if (pending.length === 0) {
      return []
    }

    return [{ dateKey, date, tasks: pending }]
  })
}

export function formatPomodoroDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date)
}

export function formatPlannerCardDate(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(date)
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
  }).format(date)
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(date)

  return `${weekday}, ${day} ${month}`
}

export function isTodayDate(date: Date, referenceDate = new Date()) {
  return toDateKey(date) === toDateKey(referenceDate)
}

export function formatPreviousPendingDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date)
}

export function formatSelectedDateLabel(date: Date, referenceDate = new Date()) {
  if (toDateKey(date) === toDateKey(referenceDate)) {
    return "Today"
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date)
}

export function formatCalendarMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date)
}

function getOrdinalSuffix(day: number) {
  if (day >= 11 && day <= 13) {
    return "th"
  }

  switch (day % 10) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

export function formatMobileCalendarDate(date: Date) {
  const day = date.getDate()
  const monthYear = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date)

  return `${day}${getOrdinalSuffix(day)} ${monthYear}`
}

export function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startDate = addDays(firstDay, -firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => ({
    date: addDays(startDate, index),
  }))
}

export { WEEK_DAY_OPTIONS }

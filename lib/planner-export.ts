import {
  addDays,
  fromDateKey,
  getDayState,
  matchesRoutineDate,
  toDateKey,
  type PlannerDayState,
  type RoutineRule,
} from "@/lib/planner"

export type PlannerExportRow = {
  date: string
  day: string
  source: string
  status: "Pending" | "Completed"
  task: string
}

function escapeCsvValue(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(date)
}

function formatSource(source: string) {
  if (source === "routine") return "Routine"
  if (source === "dump") return "Task dump"
  return "Manual"
}

export function collectPlannerExportRows(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  startDateKey: string,
  endDateKey: string,
): PlannerExportRow[] {
  const start = fromDateKey(startDateKey)
  const end = fromDateKey(endDateKey)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return []
  }

  const rows: PlannerExportRow[] = []
  let cursor = start

  while (cursor <= end) {
    const dateKey = toDateKey(cursor)
    const dayState = getDayState(plannerState, dateKey)
    const completedIds = new Set(dayState.completed.map((task) => task.id))
    const weekday = formatWeekday(cursor)

    const routineTasks = routines
      .filter((routine) => matchesRoutineDate(routine, cursor))
      .map((routine) => ({
        id: `${routine.id}-${dateKey}`,
        title: routine.title,
        source: "routine" as const,
      }))

    for (const task of [...routineTasks, ...dayState.tasks]) {
      if (completedIds.has(task.id)) continue

      rows.push({
        date: dateKey,
        day: weekday,
        task: task.title,
        status: "Pending",
        source: formatSource(task.source),
      })
    }

    for (const task of dayState.completed) {
      rows.push({
        date: dateKey,
        day: weekday,
        task: task.title,
        status: "Completed",
        source: formatSource(task.source),
      })
    }

    cursor = addDays(cursor, 1)
  }

  return rows
}

export function buildPlannerCsv(rows: PlannerExportRow[]) {
  const header = ["Date", "Day", "Task", "Status", "Source"]
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.date),
        escapeCsvValue(row.day),
        escapeCsvValue(row.task),
        escapeCsvValue(row.status),
        escapeCsvValue(row.source),
      ].join(","),
    ),
  ]

  return `\uFEFF${lines.join("\n")}`
}

export function downloadPlannerSheet(
  plannerState: Record<string, PlannerDayState>,
  routines: RoutineRule[],
  startDateKey: string,
  endDateKey: string,
) {
  const rows = collectPlannerExportRows(
    plannerState,
    routines,
    startDateKey,
    endDateKey,
  )
  const csv = buildPlannerCsv(rows)
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const fileName = `whim-tasks-${startDateKey}-to-${endDateKey}.csv`

  link.href = url
  link.download = fileName
  link.rel = "noopener"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return rows.length
}

"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  MoreHorizontal,
  Plus,
  PencilLine,
  Repeat,
  Trash2,
  X,
} from "lucide-react"
import { TaskRow, type TaskRowAction } from "./task-row"
import { usePlanner } from "@/components/planner-provider"
import { useReminderUi } from "@/components/reminder-ui-provider"
import { buildReminderPickerTarget } from "@/components/reminder-picker-modal"

type PlannerTask = {
  id: string
  routineId?: string
  source: "manual" | "routine" | "dump"
  title: string
}

type PlannerDayState = {
  completed: PlannerTask[]
  draft: string
  isAdding: boolean
  showCompleted: boolean
  tasks: PlannerTask[]
}

type PlannerView = "daily-planner" | "routine" | "task-dump"
type RoutineFrequency = "daily" | "weekly" | "bi-weekly" | "monthly"

type RoutineRule = {
  createdDateKey: string
  frequency: RoutineFrequency
  id: string
  monthDates: number[]
  title: string
  weekDays: number[]
}

type RoutineDraft = {
  frequency: RoutineFrequency
  monthDates: number[]
  title: string
  weekDays: number[]
}

type TaskDumpState = {
  completed: PlannerTask[]
  draft: string
  isAdding: boolean
  items: PlannerTask[]
  showCompleted: boolean
}

type TaskDumpScheduleMenuState = {
  taskId: string
  x: number
  y: number
} | null

type DragPayload = {
  originDateKey: string
  sourceList: "active" | "completed"
  task: PlannerTask
}

type EditableTaskTarget =
  | {
      task: PlannerTask
      type: "day-active" | "day-completed"
      dateKey: string
    }
  | {
      task: PlannerTask
      type: "dump-active" | "dump-completed"
    }

type EditingTaskState = EditableTaskTarget & {
  value: string
}

type TaskMenuState = EditableTaskTarget & {
  x: number
  y: number
}

type RoutineMenuState = {
  routine: RoutineRule
  x: number
  y: number
}

type MoveMenuState = {
  target: EditableTaskTarget
  x: number
  y: number
}

function getTaskMenuPosition(
  trigger: HTMLElement,
  menuWidth = 176,
  menuHeight = 112,
) {
  const rect = trigger.getBoundingClientRect()
  const margin = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let x = rect.right - menuWidth
  let y = rect.bottom + margin

  if (x < margin) {
    x = rect.left
  }

  if (x + menuWidth > viewportWidth - margin) {
    x = viewportWidth - menuWidth - margin
  }

  if (y + menuHeight > viewportHeight - margin) {
    y = rect.top - menuHeight - margin
  }

  return {
    x: Math.max(margin, x),
    y: Math.max(margin, y),
  }
}

const DAY_WINDOW = [-1, 0, 1]
const WEEK_DAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const
const MONTH_DATE_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1)

const today = new Date()
const initialTodayKey = toDateKey(today)

const plannerViews: Array<{
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: PlannerView
}> = [
  { icon: CalendarDays, label: "Daily Planner", value: "daily-planner" },
  { icon: Repeat, label: "Routine", value: "routine" },
  { icon: ListTodo, label: "Task Dump", value: "task-dump" },
]

const routineFrequencyOptions: Array<{
  description: string
  label: string
  value: RoutineFrequency
}> = [
  { value: "daily", label: "Daily", description: "Runs every day" },
  { value: "weekly", label: "Weekly", description: "Choose weekdays" },
  { value: "bi-weekly", label: "Bi-Weekly", description: "Every other week" },
  { value: "monthly", label: "Monthly", description: "Pick month dates" },
]
export function DailyPlannerView() {
  const {
    plannerState,
    removeRemindersForRoutine,
    removeRemindersForTask,
    routines,
    setPlannerState,
    setRoutines,
    updateDay,
  } = usePlanner()
  const { openReminderPicker } = useReminderUi()
  const [centerDate, setCenterDate] = React.useState(() => stripTime(today))
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false)
  const [calendarMonth, setCalendarMonth] = React.useState(() =>
    new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const [activeView, setActiveView] = React.useState<PlannerView>("daily-planner")
  const [isRoutineModalOpen, setIsRoutineModalOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)
  const [routineDraft, setRoutineDraft] = React.useState<RoutineDraft>({
    title: "",
    frequency: "daily",
    weekDays: [],
    monthDates: [],
  })
  const [taskDumpState, setTaskDumpState] = React.useState<TaskDumpState>({
    items: [],
    completed: [],
    draft: "",
    isAdding: false,
    showCompleted: false,
  })
  const [dragTargetDateKey, setDragTargetDateKey] = React.useState<string | null>(null)
  const [editingTask, setEditingTask] = React.useState<EditingTaskState | null>(null)
  const [routineTarget, setRoutineTarget] = React.useState<EditableTaskTarget | null>(null)
  const [taskMenu, setTaskMenu] = React.useState<TaskMenuState | null>(null)
  const [routineMenu, setRoutineMenu] = React.useState<RoutineMenuState | null>(null)
  const [moveMenu, setMoveMenu] = React.useState<MoveMenuState | null>(null)
  const [taskDumpScheduleMenu, setTaskDumpScheduleMenu] =
    React.useState<TaskDumpScheduleMenuState>(null)
  const [taskDumpScheduleMonth, setTaskDumpScheduleMonth] = React.useState(() =>
    new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const [editingRoutineId, setEditingRoutineId] = React.useState<string | null>(null)
  const dragPreviewRef = React.useRef<HTMLElement | null>(null)
  const taskMenuRef = React.useRef<HTMLDivElement | null>(null)
  const routineMenuRef = React.useRef<HTMLDivElement | null>(null)
  const moveMenuRef = React.useRef<HTMLDivElement | null>(null)
  const taskDumpScheduleMenuRef = React.useRef<HTMLDivElement | null>(null)
  const datePickerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  React.useEffect(() => {
    if (
      !taskMenu &&
      !routineMenu &&
      !moveMenu &&
      !isCalendarOpen &&
      !taskDumpScheduleMenu
    ) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (taskMenuRef.current?.contains(target)) {
        return
      }

      if (routineMenuRef.current?.contains(target)) {
        return
      }

      if (moveMenuRef.current?.contains(target)) {
        return
      }

      if (taskDumpScheduleMenuRef.current?.contains(target)) {
        return
      }

      if (datePickerRef.current?.contains(target)) {
        return
      }

      setTaskMenu(null)
      setRoutineMenu(null)
      setMoveMenu(null)
      setTaskDumpScheduleMenu(null)
      setIsCalendarOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTaskMenu(null)
        setRoutineMenu(null)
        setMoveMenu(null)
        setTaskDumpScheduleMenu(null)
        setIsCalendarOpen(false)
        setEditingTask(null)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isCalendarOpen, moveMenu, routineMenu, taskDumpScheduleMenu, taskMenu])

  const visibleDays = React.useMemo(
    () => DAY_WINDOW.map((offset) => buildVisibleDay(addDays(centerDate, offset))),
    [centerDate]
  )
  const weekDays = React.useMemo(() => buildCurrentWeek(centerDate), [centerDate])

  const resetRoutineDraft = React.useCallback(() => {
    setRoutineDraft({
      title: "",
      frequency: "daily",
      weekDays: [],
      monthDates: [],
    })
  }, [])

  const openRoutineModal = (routine?: RoutineRule) => {
    setRoutineTarget(null)
    if (routine) {
      setEditingRoutineId(routine.id)
      setRoutineDraft({
        title: routine.title,
        frequency: routine.frequency,
        weekDays: routine.weekDays,
        monthDates: routine.monthDates,
      })
    } else {
      setEditingRoutineId(null)
      resetRoutineDraft()
    }
    setIsRoutineModalOpen(true)
  }

  const closeRoutineModal = () => {
    setIsRoutineModalOpen(false)
    setRoutineTarget(null)
    setEditingRoutineId(null)
    resetRoutineDraft()
  }

  const updateTaskDump = React.useCallback(
    (updater: (current: TaskDumpState) => TaskDumpState) => {
      setTaskDumpState((current) => updater(current))
    },
    []
  )

  const renderCalendarPopover = (options: {
    month: Date
    onNextMonth: () => void
    onPreviousMonth: () => void
    onSelectDate: (date: Date) => void
    selectedDate: Date
    className?: string
  }) => {
    const days = buildCalendarDays(options.month)

    return (
      <div
        className={[
          "daily-planner__calendar",
          options.className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
      >
        <div className="daily-planner__calendar-header">
          <button
            aria-label="Previous month"
            className="daily-planner__icon-button"
            onClick={options.onPreviousMonth}
            type="button"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="daily-planner__calendar-title">
            {formatCalendarMonth(options.month)}
          </span>
          <button
            aria-label="Next month"
            className="daily-planner__icon-button"
            onClick={options.onNextMonth}
            type="button"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="daily-planner__calendar-weekdays">
          {WEEK_DAY_OPTIONS.map((day) => (
            <span className="daily-planner__calendar-weekday" key={day.label}>
              {day.label}
            </span>
          ))}
        </div>

        <div className="daily-planner__calendar-grid">
          {days.map((day) => {
            const isSelected = toDateKey(day.date) === toDateKey(options.selectedDate)
            const isCurrentMonth = day.date.getMonth() === options.month.getMonth()
            const isToday = toDateKey(day.date) === initialTodayKey

            return (
              <button
                className={`daily-planner__calendar-day ${
                  isSelected ? "daily-planner__calendar-day--selected" : ""
                } ${isToday ? "daily-planner__calendar-day--today" : ""} ${
                  !isCurrentMonth ? "daily-planner__calendar-day--muted" : ""
                }`}
                key={toDateKey(day.date)}
                onClick={() => options.onSelectDate(day.date)}
                type="button"
              >
                {day.date.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renameRoutine = React.useCallback((routineId: string, title: string) => {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId ? { ...routine, title } : routine
      )
    )
    setPlannerState((current) =>
      Object.fromEntries(
        Object.entries(current).map(([dateKey, day]) => [
          dateKey,
          {
            ...day,
            tasks: day.tasks.map((task) =>
              task.routineId === routineId ? { ...task, title } : task
            ),
            completed: day.completed.map((task) =>
              task.routineId === routineId ? { ...task, title } : task
            ),
          },
        ])
      )
    )
  }, [])

  const deleteRoutine = React.useCallback((routineId: string) => {
    removeRemindersForRoutine(routineId)
    setRoutines((current) => current.filter((routine) => routine.id !== routineId))
    setPlannerState((current) =>
      Object.fromEntries(
        Object.entries(current).map(([dateKey, day]) => [
          dateKey,
          {
            ...day,
            tasks: day.tasks.filter((task) => task.routineId !== routineId),
            completed: day.completed.filter((task) => task.routineId !== routineId),
          },
        ])
      )
    )
  }, [removeRemindersForRoutine, setPlannerState, setRoutines])

  const removeTaskTarget = React.useCallback(
    (target: EditableTaskTarget) => {
      if (target.type === "day-active") {
        updateDay(target.dateKey, (day) => ({
          ...day,
          tasks: day.tasks.filter((item) => item.id !== target.task.id),
        }))
        return
      }

      if (target.type === "day-completed") {
        updateDay(target.dateKey, (day) => ({
          ...day,
          completed: day.completed.filter((item) => item.id !== target.task.id),
        }))
        return
      }

      if (target.type === "dump-active") {
        updateTaskDump((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== target.task.id),
        }))
        return
      }

      updateTaskDump((current) => ({
        ...current,
        completed: current.completed.filter((item) => item.id !== target.task.id),
      }))
    },
    [updateDay, updateTaskDump]
  )

  const startEditingTask = React.useCallback((target: EditableTaskTarget) => {
    setTaskMenu(null)
    setEditingTask({
      ...target,
      value: target.task.title,
    })
  }, [])

  const saveEditingTask = React.useCallback(() => {
    if (!editingTask) {
      return
    }

    const title = editingTask.value.trim()

    if (!title) {
      setEditingTask(null)
      return
    }

    if (editingTask.task.source === "routine" && editingTask.task.routineId) {
      renameRoutine(editingTask.task.routineId, title)
      setEditingTask(null)
      return
    }

    if (editingTask.type === "day-active") {
      updateDay(editingTask.dateKey, (day) => ({
        ...day,
        tasks: day.tasks.map((task) =>
          task.id === editingTask.task.id ? { ...task, title } : task
        ),
      }))
    } else if (editingTask.type === "day-completed") {
      updateDay(editingTask.dateKey, (day) => ({
        ...day,
        completed: day.completed.map((task) =>
          task.id === editingTask.task.id ? { ...task, title } : task
        ),
      }))
    } else if (editingTask.type === "dump-active") {
      updateTaskDump((current) => ({
        ...current,
        items: current.items.map((task) =>
          task.id === editingTask.task.id ? { ...task, title } : task
        ),
      }))
    } else {
      updateTaskDump((current) => ({
        ...current,
        completed: current.completed.map((task) =>
          task.id === editingTask.task.id ? { ...task, title } : task
        ),
      }))
    }

    setEditingTask(null)
  }, [editingTask, renameRoutine, updateDay, updateTaskDump])

  const moveTaskToDump = React.useCallback(
    (target: EditableTaskTarget) => {
      if (target.task.source === "routine" && target.task.routineId) {
        deleteRoutine(target.task.routineId)
      } else {
        removeTaskTarget(target)
      }

      updateTaskDump((current) => ({
        ...current,
        items: [...current.items, createTask(target.task.title, "dump")],
      }))
      setTaskMenu(null)
      setMoveMenu(null)
    },
    [deleteRoutine, removeTaskTarget, updateTaskDump]
  )

  const moveTaskToRoutine = React.useCallback(
    (target: EditableTaskTarget) => {
      if (target.task.source === "routine") {
        setTaskMenu(null)
        setMoveMenu(null)
        return
      }

      setTaskMenu(null)
      setMoveMenu(null)
      setRoutineTarget(target)
      setRoutineDraft({
        title: target.task.title,
        frequency: "daily",
        weekDays: [],
        monthDates: [],
      })
      setIsRoutineModalOpen(true)
    },
    []
  )

  const openRoutineMenu = (
    event: React.MouseEvent<HTMLElement>,
    routine: RoutineRule
  ) => {
    event.preventDefault()
    setTaskMenu(null)
    setEditingTask(null)
    setRoutineMenu({
      routine,
      ...getTaskMenuPosition(event.currentTarget),
    })
  }

  const editRoutine = React.useCallback((routine: RoutineRule) => {
    setRoutineMenu(null)
    openRoutineModal(routine)
  }, [])

  const deleteRoutineFromMenu = React.useCallback(
    (routineId: string) => {
      deleteRoutine(routineId)
      setRoutineMenu(null)
    },
    [deleteRoutine]
  )

  const moveRoutineToDump = React.useCallback(
    (routine: RoutineRule) => {
      deleteRoutine(routine.id)
      updateTaskDump((current) => ({
        ...current,
        items: [...current.items, createTask(routine.title, "dump")],
      }))
      setRoutineMenu(null)
    },
    [deleteRoutine, updateTaskDump]
  )

  const deleteTask = React.useCallback(
    (target: EditableTaskTarget) => {
      if (target.task.source === "routine" && target.task.routineId) {
        deleteRoutine(target.task.routineId)
      } else {
        removeRemindersForTask(target.task.id)
        removeTaskTarget(target)
      }

      setTaskMenu(null)
      setMoveMenu(null)
      setEditingTask((current) =>
        current?.task.id === target.task.id ? null : current
      )
    },
    [deleteRoutine, removeRemindersForTask, removeTaskTarget]
  )

  const handleAddTask = (dateKey: string) => {
    updateDay(dateKey, (day) => ({
      ...day,
      isAdding: true,
    }))
  }

  const handleDraftChange = (dateKey: string, draft: string) => {
    updateDay(dateKey, (day) => ({
      ...day,
      draft,
    }))
  }

  const handleDraftSubmit = (dateKey: string) => {
    updateDay(dateKey, (day) => {
      const title = day.draft.trim()

      if (!title) {
        return {
          ...day,
          draft: "",
          isAdding: false,
        }
      }

      return {
        ...day,
        tasks: [...day.tasks, createTask(title, "manual")],
        draft: "",
        isAdding: false,
      }
    })
  }

  const handleDraftCancel = (dateKey: string) => {
    updateDay(dateKey, (day) => ({
      ...day,
      draft: "",
      isAdding: false,
    }))
  }

  const handleTaskComplete = (dateKey: string, task: PlannerTask) => {
    updateDay(dateKey, (day) => {
      const nextManualTasks =
        task.source === "manual"
          ? day.tasks.filter((item) => item.id !== task.id)
          : day.tasks

      if (day.completed.some((item) => item.id === task.id)) {
        return day
      }

      return {
        ...day,
        tasks: nextManualTasks,
        completed: [...day.completed, task],
      }
    })
  }

  const restoreCompletedTask = (dateKey: string, taskId: string) => {
    updateDay(dateKey, (day) => {
      const task = day.completed.find((item) => item.id === taskId)

      if (!task) {
        return day
      }

      return {
        ...day,
        tasks: [...day.tasks, task],
        completed: day.completed.filter((item) => item.id !== taskId),
      }
    })
  }

  const handleTaskDragStart = (
    event: React.DragEvent<HTMLElement>,
    payload: DragPayload
  ) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("application/json", JSON.stringify(payload))

    const preview = event.currentTarget.cloneNode(true) as HTMLElement
    preview.style.position = "fixed"
    preview.style.top = "-9999px"
    preview.style.left = "-9999px"
    preview.style.width = `${event.currentTarget.clientWidth}px`
    preview.style.borderRadius = "18px"
    preview.style.overflow = "hidden"
    preview.style.boxShadow = "none"
    preview.style.pointerEvents = "none"
    preview.style.opacity = "1"
    preview.style.background = "white"
    document.body.appendChild(preview)
    event.dataTransfer.setDragImage(preview, 24, 24)
    dragPreviewRef.current = preview
  }

  const clearDragPreview = () => {
    if (dragPreviewRef.current) {
      dragPreviewRef.current.remove()
      dragPreviewRef.current = null
    }
  }

  const handleTaskDrop = (
    event: React.DragEvent<HTMLElement>,
    targetDateKey: string
  ) => {
    event.preventDefault()
    setDragTargetDateKey(null)

    const payloadText = event.dataTransfer.getData("application/json")

    if (!payloadText) {
      return
    }

    const payload = JSON.parse(payloadText) as DragPayload

    if (payload.task.source === "routine") {
      updateDay(targetDateKey, (day) => ({
        ...day,
        tasks: [...day.tasks, createTask(payload.task.title, "manual")],
      }))
      return
    }

    if (payload.originDateKey === targetDateKey && payload.sourceList === "active") {
      return
    }

    if (payload.sourceList === "active") {
      updateDay(payload.originDateKey, (day) => ({
        ...day,
        tasks: day.tasks.filter((item) => item.id !== payload.task.id),
      }))
    }

    if (payload.sourceList === "completed") {
      updateDay(payload.originDateKey, (day) => ({
        ...day,
        completed: day.completed.filter((item) => item.id !== payload.task.id),
      }))
    }

    updateDay(targetDateKey, (day) =>
      payload.sourceList === "completed"
        ? {
            ...day,
            completed: [...day.completed, payload.task],
          }
        : {
            ...day,
            tasks: [...day.tasks, payload.task],
          }
    )
  }

  const toggleCompletedTasks = (dateKey: string) => {
    updateDay(dateKey, (day) => ({
      ...day,
      showCompleted: !day.showCompleted,
    }))
  }

  const toggleRoutineWeekDay = (weekDay: number) => {
    setRoutineDraft((current) => ({
      ...current,
      weekDays: current.weekDays.includes(weekDay)
        ? current.weekDays.filter((value) => value !== weekDay)
        : [...current.weekDays, weekDay].sort((left, right) => left - right),
    }))
  }

  const toggleRoutineMonthDate = (monthDate: number) => {
    setRoutineDraft((current) => ({
      ...current,
      monthDates: current.monthDates.includes(monthDate)
        ? current.monthDates.filter((value) => value !== monthDate)
        : [...current.monthDates, monthDate].sort((left, right) => left - right),
    }))
  }

  const createRoutine = () => {
    const title = routineDraft.title.trim()

    if (!title) {
      return
    }

    if (
      (routineDraft.frequency === "weekly" ||
        routineDraft.frequency === "bi-weekly") &&
      routineDraft.weekDays.length === 0
    ) {
      return
    }

    if (
      routineDraft.frequency === "monthly" &&
      routineDraft.monthDates.length === 0
    ) {
      return
    }

    if (editingRoutineId) {
      setRoutines((current) =>
        current.map((routine) =>
          routine.id === editingRoutineId
            ? {
                ...routine,
                title,
                frequency: routineDraft.frequency,
                weekDays: routineDraft.weekDays,
                monthDates: routineDraft.monthDates,
              }
            : routine
        )
      )
      closeRoutineModal()
      return
    }

    if (routineTarget) {
      removeTaskTarget(routineTarget)
    }

    setRoutines((current) => [
      ...current,
      {
        id: `routine-${Math.random().toString(36).slice(2, 9)}`,
        title,
        frequency: routineDraft.frequency,
        weekDays: routineDraft.weekDays,
        monthDates: routineDraft.monthDates,
        createdDateKey:
          routineTarget?.type === "day-active" ||
          routineTarget?.type === "day-completed"
            ? routineTarget.dateKey
            : initialTodayKey,
      },
    ])

    closeRoutineModal()
  }

  const addTaskDumpItem = () => {
    const title = taskDumpState.draft.trim()

    if (!title) {
      updateTaskDump((current) => ({
        ...current,
        draft: "",
        isAdding: false,
      }))
      return
    }

    updateTaskDump((current) => ({
      ...current,
      items: [...current.items, createTask(title, "dump")],
      draft: "",
      isAdding: false,
    }))
  }

  const completeDumpTask = (taskId: string) => {
    updateTaskDump((current) => {
      const task = current.items.find((item) => item.id === taskId)

      if (!task) {
        return current
      }

      return {
        ...current,
        items: current.items.filter((item) => item.id !== taskId),
        completed: [...current.completed, task],
      }
    })
  }

  const restoreDumpTask = (taskId: string) => {
    updateTaskDump((current) => {
      const task = current.completed.find((item) => item.id === taskId)

      if (!task) {
        return current
      }

      return {
        ...current,
        completed: current.completed.filter((item) => item.id !== taskId),
        items: [...current.items, task],
      }
    })
  }

  const scheduleDumpTask = (taskId: string, dateKey: string) => {
    const task =
      taskDumpState.items.find((item) => item.id === taskId) ??
      taskDumpState.completed.find((item) => item.id === taskId)

    if (!task) {
      return
    }

    updateDay(dateKey, (day) => ({
      ...day,
      tasks: [...day.tasks, createTask(task.title, "manual")],
    }))

    updateTaskDump((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== taskId),
      completed: current.completed.filter((item) => item.id !== taskId),
    }))
    setTaskDumpScheduleMenu(null)
  }

  const openTaskMenu = (
    event: React.MouseEvent<HTMLElement>,
    target: EditableTaskTarget
  ) => {
    event.preventDefault()
    setEditingTask(null)
    setMoveMenu(null)
    const position = getTaskMenuPosition(event.currentTarget)
    setTaskMenu({
      ...target,
      ...position,
    })
  }

  const getDateKeyForTarget = React.useCallback(
    (target: EditableTaskTarget) => {
      if (target.type === "day-active" || target.type === "day-completed") {
        return target.dateKey
      }

      return toDateKey(centerDate)
    },
    [centerDate],
  )

  const openReminderForTarget = React.useCallback(
    (target: EditableTaskTarget) => {
      setTaskMenu(null)
      setMoveMenu(null)
      setRoutineMenu(null)
      openReminderPicker(
        buildReminderPickerTarget(target.task, getDateKeyForTarget(target)),
      )
    },
    [getDateKeyForTarget, openReminderPicker],
  )

  const openReminderForRoutine = React.useCallback(
    (routine: RoutineRule) => {
      setRoutineMenu(null)
      openReminderPicker({
        kind: "routine",
        routineId: routine.id,
        title: routine.title,
      })
    },
    [openReminderPicker],
  )

  const openMoveMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, target: EditableTaskTarget) => {
      event.stopPropagation()
      setTaskMenu(null)
      setRoutineMenu(null)
      setMoveMenu({
        target,
        ...getTaskMenuPosition(event.currentTarget),
      })
    },
    []
  )

  const openTaskDumpScheduleMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, taskId: string) => {
      event.stopPropagation()
      setTaskMenu(null)
      setRoutineMenu(null)
      setMoveMenu(null)
      setTaskDumpScheduleMenu({
        taskId,
        x: Math.max(16, Math.min(event.clientX - 320, window.innerWidth - 356)),
        y: Math.max(16, event.clientY + 12),
      })
      setTaskDumpScheduleMonth(
        new Date(centerDate.getFullYear(), centerDate.getMonth(), 1)
      )
    },
    [centerDate]
  )

  const buildDailyTaskActions = React.useCallback(
    (target: Extract<EditableTaskTarget, { type: "day-active" | "day-completed" }>) => {
      const actions: TaskRowAction[] = [
        {
          key: "edit",
          label: "Edit task",
          icon: <PencilLine className="size-4" />,
          onClick: () => startEditingTask(target),
        },
        {
          key: "delete",
          label: "Delete task",
          icon: <Trash2 className="size-4" />,
          onClick: () => deleteTask(target),
        },
      {
        key: "reminder",
        label: "Set reminder",
        icon: <Bell className="size-4" />,
        onClick: (event) => {
          event.stopPropagation()
          openReminderForTarget(target)
        },
      },
      {
        key: "more",
        label: "Move task",
        icon: <MoreHorizontal className="size-4" />,
        onClick: (event) => openMoveMenu(event, target),
      },
    ]

    return actions
  },
  [deleteTask, openMoveMenu, openReminderForTarget, startEditingTask]
)

  const buildRoutineActions = React.useCallback(
    (routine: RoutineRule): TaskRowAction[] => [
      {
        key: "edit",
        label: "Edit routine",
        icon: <PencilLine className="size-4" />,
        onClick: () => editRoutine(routine),
      },
      {
        key: "delete",
        label: "Delete routine",
        icon: <Trash2 className="size-4" />,
        onClick: () => deleteRoutineFromMenu(routine.id),
      },
      {
        key: "reminder",
        label: "Set reminder",
        icon: <Bell className="size-4" />,
        onClick: () => openReminderForRoutine(routine),
      },
      {
        key: "dump",
        label: "Move to dump",
        icon: <ArrowLeftRight className="size-4" />,
        onClick: () => moveRoutineToDump(routine),
      },
    ],
    [deleteRoutineFromMenu, editRoutine, moveRoutineToDump, openReminderForRoutine]
  )

  const renderTaskLabel = (
    target: EditableTaskTarget,
    options?: {
      completed?: boolean
      meta?: string
    }
  ) => {
    const isEditing = isTaskEditing(target)

    if (isEditing && editingTask) {
      return (
        <input
          autoFocus
          className="daily-planner__task-editor"
          onBlur={saveEditingTask}
          onChange={(event) =>
            setEditingTask((current) =>
              current ? { ...current, value: event.target.value } : current
            )
          }
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              saveEditingTask()
            }

            if (event.key === "Escape") {
              setEditingTask(null)
            }
          }}
          value={editingTask.value}
        />
      )
    }

    return (
      <>
        <span
          className={
            options?.completed
              ? "daily-planner__completed-copy"
              : "daily-planner__task-copy"
          }
        >
          {target.task.title}
        </span>
        {options?.meta ? (
          <span className="daily-planner__task-meta" aria-label={options.meta} />
        ) : null}
      </>
    )
  }

  const isTaskEditing = (target: EditableTaskTarget) => {
    const editingDateKey =
      editingTask && "dateKey" in editingTask ? editingTask.dateKey : null
    const sharesDateKey =
      "dateKey" in target
        ? editingDateKey === target.dateKey
        : editingDateKey === null

    return (
      editingTask?.type === target.type &&
      editingTask.task.id === target.task.id &&
      sharesDateKey
    )
  }

  const renderDailyView = () => (
    <div className="daily-planner__toolbar-actions">
      <button
        className="daily-planner__toolbar-button daily-planner__date-button"
        onClick={() => setCenterDate(stripTime(today))}
        type="button"
      >
        {formatSelectedDateLabel(centerDate)}
      </button>

      <div className="daily-planner__date-picker" ref={datePickerRef}>
        <button
          aria-label="Open calendar"
          className="daily-planner__toolbar-button"
          onClick={() => {
            setCalendarMonth(new Date(centerDate.getFullYear(), centerDate.getMonth(), 1))
            setIsCalendarOpen((current) => !current)
          }}
          type="button"
        >
          <CalendarDays className="size-4" />
        </button>

        {isCalendarOpen ? (
          renderCalendarPopover({
            month: calendarMonth,
            onNextMonth: () =>
              setCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
              ),
            onPreviousMonth: () =>
              setCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
              ),
            onSelectDate: (date) => {
              const nextDate = stripTime(date)
              setCenterDate(nextDate)
              setCalendarMonth(
                new Date(nextDate.getFullYear(), nextDate.getMonth(), 1),
              )
              setIsCalendarOpen(false)
            },
            selectedDate: centerDate,
          })
        ) : null}
      </div>

      <button
        aria-label="Previous day"
        className="daily-planner__icon-button"
        onClick={() => setCenterDate((current) => addDays(current, -1))}
        type="button"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        aria-label="Next day"
        className="daily-planner__icon-button"
        onClick={() => setCenterDate((current) => addDays(current, 1))}
        type="button"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )

  return (
    <section className="daily-planner" aria-label="Daily planner">
      <div className="daily-planner__toolbar">
        <div className="daily-planner__views" aria-label="Planner views" role="tablist">
          {plannerViews.map((view) => {
            const Icon = view.icon

            return (
              <button
                aria-selected={activeView === view.value}
                className={`daily-planner__view-chip ${
                  activeView === view.value ? "daily-planner__view-chip--active" : ""
                }`}
                key={view.value}
                onClick={() => setActiveView(view.value)}
                role="tab"
                type="button"
              >
                <Icon className="size-4" />
                <span>{view.label}</span>
              </button>
            )
          })}
        </div>

        {activeView === "daily-planner" ? renderDailyView() : null}
      </div>

      {activeView === "daily-planner" ? (
        <div className="daily-planner__content">
          <div className="daily-planner__columns">
            {visibleDays.map((day) => {
              const dayState = plannerState[day.key] ?? {
                tasks: [],
                completed: [],
                draft: "",
                isAdding: false,
                showCompleted: false,
              }
              const isCenterDay = day.key === toDateKey(centerDate)
              const completedIds = new Set(dayState.completed.map((task) => task.id))
              const routineTasks = routines
                .filter((routine) => matchesRoutineDate(routine, day.date))
                .map((routine) => ({
                  id: `${routine.id}-${day.key}`,
                  title: routine.title,
                  source: "routine" as const,
                  routineId: routine.id,
                }))
              const visibleTasks = [...routineTasks, ...dayState.tasks].filter(
                (task) => !completedIds.has(task.id)
              )

              return (
                <section
                  className={`daily-planner__day ${
                    day.isToday ? "daily-planner__day--today" : ""
                  } ${isCenterDay ? "daily-planner__day--center" : ""} ${
                    dragTargetDateKey === day.key ? "daily-planner__day--drop-target" : ""
                  }`}
                  key={day.key}
                  onDragLeave={() => setDragTargetDateKey((current) => (current === day.key ? null : current))}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragTargetDateKey(day.key)
                  }}
                  onDrop={(event) => handleTaskDrop(event, day.key)}
                >
                  <header className="daily-planner__day-header">
                    <h2 className="daily-planner__day-date">{day.fullDate}</h2>
                    {day.isToday ? (
                      <span className="daily-planner__today-badge">Today</span>
                    ) : null}
                  </header>

                  <div className="daily-planner__day-body">
                    {visibleTasks.length > 0 ? (
                      <div className="daily-planner__task-list">
                        {visibleTasks.map((task) => (
                          <TaskRow
                            checkboxLabel={`Mark ${task.title} complete`}
                            className={`${
                              task.source !== "routine"
                                ? "daily-planner__task-row--draggable"
                                : ""
                            } ${
                              isTaskEditing({
                                type: "day-active",
                                dateKey: day.key,
                                task,
                              })
                                ? "daily-planner__task-row--editing"
                                : ""
                            }`}
                            draggable={
                              task.source !== "routine" &&
                              !isTaskEditing({
                                type: "day-active",
                                dateKey: day.key,
                                task,
                              })
                            }
                            onCheckboxClick={() => handleTaskComplete(day.key, task)}
                            onContextMenu={(event) =>
                              openTaskMenu(event, {
                                type: "day-active",
                                dateKey: day.key,
                                task,
                              })
                            }
                            onDoubleClick={() =>
                              startEditingTask({
                                type: "day-active",
                                dateKey: day.key,
                                task,
                              })
                            }
                            onDragEnd={() => {
                              setDragTargetDateKey(null)
                              clearDragPreview()
                            }}
                        onDragStart={(event) =>
                          handleTaskDragStart(event, {
                            originDateKey: day.key,
                            sourceList: "active",
                            task,
                          })
                        }
                        actions={buildDailyTaskActions({
                          type: "day-active",
                          dateKey: day.key,
                          task,
                        })}
                        showCheckbox
                        variant="day"
                        key={task.id}
                      >
                            {renderTaskLabel(
                              {
                                type: "day-active",
                                dateKey: day.key,
                                task,
                              },
                              {
                                meta: task.source === "routine" ? "Routine" : undefined,
                              }
                            )}
                          </TaskRow>
                        ))}
                      </div>
                    ) : null}

                    {dayState.isAdding ? (
                      <input
                        autoFocus
                        className="daily-planner__task-input"
                        onBlur={() => {
                          if (dayState.draft.trim()) {
                            handleDraftSubmit(day.key)
                            return
                          }

                          handleDraftCancel(day.key)
                        }}
                        onChange={(event) =>
                          handleDraftChange(day.key, event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleDraftSubmit(day.key)
                          }

                          if (event.key === "Escape") {
                            handleDraftCancel(day.key)
                          }
                        }}
                        placeholder="Type a task and press Enter"
                        value={dayState.draft}
                      />
                    ) : (
                      <button
                        className={`daily-planner__add-task ${
                          visibleTasks.length === 0 &&
                          dayState.completed.length === 0
                            ? "daily-planner__add-task--empty"
                            : ""
                        }`}
                        onClick={() => handleAddTask(day.key)}
                        type="button"
                      >
                        <Plus className="size-4" />
                        <span>Add task</span>
                      </button>
                    )}

                    {dayState.completed.length > 0 ? (
                      <div className="daily-planner__completed">
                        <button
                          className="daily-planner__completed-toggle"
                          onClick={() => toggleCompletedTasks(day.key)}
                          type="button"
                        >
                          {dayState.showCompleted ? "Hide" : "Show"}{" "}
                          {dayState.completed.length} completed task
                          {dayState.completed.length > 1 ? "s" : ""}
                        </button>

                        {dayState.showCompleted ? (
                          <div className="daily-planner__completed-list">
                            {dayState.completed.map((task) => (
                              <TaskRow
                                checkboxChecked
                                checkboxLabel={`Restore ${task.title}`}
                                className={`daily-planner__task-row--draggable ${
                                  isTaskEditing({
                                    type: "day-completed",
                                    dateKey: day.key,
                                    task,
                                  })
                                    ? "daily-planner__task-row--editing"
                                    : ""
                                }`}
                                draggable={
                                  !isTaskEditing({
                                    type: "day-completed",
                                    dateKey: day.key,
                                    task,
                                  })
                                }
                                onCheckboxClick={() => restoreCompletedTask(day.key, task.id)}
                                onContextMenu={(event) =>
                                  openTaskMenu(event, {
                                    type: "day-completed",
                                    dateKey: day.key,
                                    task,
                                  })
                                }
                                onDoubleClick={() =>
                                  startEditingTask({
                                    type: "day-completed",
                                    dateKey: day.key,
                                    task,
                                  })
                                }
                                onDragEnd={() => {
                                  setDragTargetDateKey(null)
                                  clearDragPreview()
                                }}
                                onDragStart={(event) =>
                                  handleTaskDragStart(event, {
                                    originDateKey: day.key,
                                    sourceList: "completed",
                                    task,
                                  })
                                }
                                actions={buildDailyTaskActions({
                                  type: "day-completed",
                                  dateKey: day.key,
                                  task,
                                })}
                                variant="day-completed"
                                key={task.id}
                              >
                                {renderTaskLabel(
                                  {
                                    type: "day-completed",
                                    dateKey: day.key,
                                    task,
                                  },
                                  {
                                    completed: true,
                                    meta:
                                      task.source === "routine"
                                        ? "Routine"
                                        : undefined,
                                  }
                                )}
                              </TaskRow>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : null}

      {activeView === "routine" ? (
        <div className="daily-planner__content">
          <div
            className={`routine-board ${
              routines.length === 0 ? "routine-board--empty" : ""
            }`}
          >
            {routines.length === 0 ? (
              <button
                className="routine-card routine-card--add routine-card--add-empty task-dump__empty-card"
                onClick={() => openRoutineModal()}
                type="button"
              >
                <Plus className="size-4" />
                <span>New routine</span>
              </button>
            ) : (
              <>
                {routines.map((routine) => (
                  <TaskRow
                    actions={buildRoutineActions(routine)}
                    checkboxLabel={`Routine ${routine.title}`}
                    routineFrequency={formatFrequencyLabel(routine.frequency)}
                    routineSchedule={describeRoutine(routine)}
                    routineTitle={routine.title}
                    key={routine.id}
                    onContextMenu={(event) => openRoutineMenu(event, routine)}
                    onDoubleClick={() => editRoutine(routine)}
                    showCheckbox={false}
                    variant="routine"
                  />
                ))}
                <button
                  className="daily-planner__add-task"
                  onClick={() => openRoutineModal()}
                  type="button"
                >
                  <Plus className="size-4" />
                  <span>New routine</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {activeView === "task-dump" ? (
        <div className="daily-planner__content">
          <div className="task-dump">
            {taskDumpState.items.length === 0 &&
            taskDumpState.completed.length === 0 &&
            !taskDumpState.isAdding ? (
              <button
                className="routine-card routine-card--add routine-card--add-empty task-dump__empty-card"
                onClick={() =>
                  updateTaskDump((current) => ({
                    ...current,
                    isAdding: true,
                  }))
                }
                type="button"
              >
                <Plus className="size-4" />
                <span>New task</span>
              </button>
            ) : (
              <div className="task-dump__list">
                {taskDumpState.items.map((task) => (
                  <TaskRow
                    checkboxLabel={`Mark ${task.title} complete`}
                    className={
                      isTaskEditing({
                        type: "dump-active",
                        task,
                      })
                        ? "daily-planner__task-row--editing"
                        : ""
                    }
                    onCheckboxClick={() => completeDumpTask(task.id)}
                    onContextMenu={(event) =>
                      openTaskMenu(event, {
                        type: "dump-active",
                        task,
                      })
                    }
                    onDoubleClick={() =>
                      startEditingTask({
                        type: "dump-active",
                        task,
                      })
                    }
                    actions={[
                      {
                        key: "edit",
                        label: "Edit task",
                        icon: <PencilLine className="size-4" />,
                        onClick: () =>
                          startEditingTask({
                            type: "dump-active",
                            task,
                          }),
                      },
                      {
                        key: "delete",
                        label: "Delete task",
                        icon: <Trash2 className="size-4" />,
                        onClick: () =>
                          deleteTask({
                            type: "dump-active",
                            task,
                          }),
                      },
                      {
                        key: "move",
                        label: "Move to routine",
                        icon: <ArrowLeftRight className="size-4" />,
                        onClick: () =>
                          moveTaskToRoutine({
                            type: "dump-active",
                            task,
                          }),
                      },
                      {
                        key: "schedule",
                        label:
                          taskDumpScheduleMenu?.taskId === task.id
                            ? "Hide schedule picker"
                            : "Open schedule picker",
                        icon: <CalendarRange className="size-4" />,
                        active: taskDumpScheduleMenu?.taskId === task.id,
                        onClick: (event) => openTaskDumpScheduleMenu(event, task.id),
                      },
                    ]}
                    variant="dump"
                    key={task.id}
                  >
                    {renderTaskLabel({
                      type: "dump-active",
                      task,
                    })}
                  </TaskRow>
                ))}
                {taskDumpState.isAdding ? (
                  <input
                    autoFocus
                    className="daily-planner__task-input"
                    onBlur={() => {
                      if (taskDumpState.draft.trim()) {
                        addTaskDumpItem()
                        return
                      }

                    updateTaskDump((current) => ({
                      ...current,
                      draft: "",
                      isAdding: false,
                    }))
                    }}
                    onChange={(event) =>
                      updateTaskDump((current) => ({
                        ...current,
                        draft: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addTaskDumpItem()
                      }

                      if (event.key === "Escape") {
                        updateTaskDump((current) => ({
                          ...current,
                          draft: "",
                          isAdding: false,
                        }))
                      }
                    }}
                    placeholder="Enter a task and press Enter"
                    value={taskDumpState.draft}
                  />
                ) : (
                  <button
                    className="daily-planner__add-task"
                    onClick={() =>
                      updateTaskDump((current) => ({
                        ...current,
                        isAdding: true,
                      }))
                    }
                    type="button"
                  >
                    <Plus className="size-4" />
                    <span>New task</span>
                  </button>
                )}
              </div>
            )}

            {taskDumpScheduleMenu ? (
              <div ref={taskDumpScheduleMenuRef}>
                {renderCalendarPopover({
                  month: taskDumpScheduleMonth,
                  onNextMonth: () =>
                    setTaskDumpScheduleMonth(
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() + 1, 1)
                    ),
                  onPreviousMonth: () =>
                    setTaskDumpScheduleMonth(
                      (current) =>
                        new Date(current.getFullYear(), current.getMonth() - 1, 1)
                    ),
                  onSelectDate: (date) =>
                    scheduleDumpTask(taskDumpScheduleMenu.taskId, toDateKey(date)),
                  selectedDate: centerDate,
                  className: "daily-planner__calendar--task-dump-schedule",
                })}
              </div>
            ) : null}

            {taskDumpState.completed.length > 0 ? (
              <div className="daily-planner__completed">
                <button
                  className="daily-planner__completed-toggle"
                  onClick={() =>
                    updateTaskDump((current) => ({
                      ...current,
                      showCompleted: !current.showCompleted,
                    }))
                  }
                  type="button"
                >
                  {taskDumpState.showCompleted ? "Hide" : "Show"}{" "}
                  {taskDumpState.completed.length} completed task
                  {taskDumpState.completed.length > 1 ? "s" : ""}
                </button>

                {taskDumpState.showCompleted ? (
                  <div className="daily-planner__completed-list">
                    {taskDumpState.completed.map((task) => (
                      <React.Fragment key={task.id}>
                        <TaskRow
                          checkboxChecked
                          checkboxLabel={`Restore ${task.title}`}
                          className={
                            isTaskEditing({
                              type: "dump-completed",
                              task,
                            })
                              ? "daily-planner__task-row--editing"
                              : ""
                          }
                          onCheckboxClick={() => restoreDumpTask(task.id)}
                          onContextMenu={(event) =>
                            openTaskMenu(event, {
                              type: "dump-completed",
                              task,
                            })
                          }
                          onDoubleClick={() =>
                            startEditingTask({
                              type: "dump-completed",
                              task,
                            })
                          }
                          actions={[
                            {
                              key: "edit",
                              label: "Edit task",
                              icon: <PencilLine className="size-4" />,
                              onClick: () =>
                                startEditingTask({
                                  type: "dump-completed",
                                  task,
                                }),
                            },
                            {
                              key: "delete",
                              label: "Delete task",
                              icon: <Trash2 className="size-4" />,
                              onClick: () =>
                                deleteTask({
                                  type: "dump-completed",
                                  task,
                                }),
                            },
                            {
                              key: "move",
                              label: "Move to routine",
                              icon: <ArrowLeftRight className="size-4" />,
                              onClick: () =>
                                moveTaskToRoutine({
                                  type: "dump-completed",
                                  task,
                                }),
                            },
                            {
                              key: "schedule",
                              label: taskDumpScheduleMenu?.taskId === task.id
                                ? "Hide schedule picker"
                                : "Open schedule picker",
                              icon: <CalendarRange className="size-4" />,
                              active: taskDumpScheduleMenu?.taskId === task.id,
                              onClick: (event) =>
                                openTaskDumpScheduleMenu(event, task.id),
                            },
                          ]}
                          variant="dump-completed"
                        >
                          {renderTaskLabel(
                            {
                              type: "dump-completed",
                              task,
                            },
                            { completed: true }
                          )}
                        </TaskRow>
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMounted && isRoutineModalOpen
        ? createPortal(
            <div
              aria-modal="true"
              className="routine-modal"
              onClick={closeRoutineModal}
              role="dialog"
            >
              <div
                className="routine-modal__panel"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="routine-modal__header">
                  <div>
                    <h3 className="routine-modal__title">Create routine</h3>
                  </div>
                  <button
                    aria-label="Close routine modal"
                    className="daily-planner__icon-button"
                    onClick={closeRoutineModal}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="routine-modal__body">
                  {!routineTarget ? (
                    <label className="routine-modal__field">
                      <span className="routine-modal__label">Routine task</span>
                      <input
                        className="daily-planner__task-input"
                        onChange={(event) =>
                          setRoutineDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Enter the routine task"
                        value={routineDraft.title}
                      />
                    </label>
                  ) : null}

                  <div className="routine-modal__field">
                    <span className="routine-modal__label">Frequency</span>
                    <div className="routine-modal__chips">
                      {routineFrequencyOptions.map((option) => (
                        <button
                          className={`routine-modal__chip ${
                            routineDraft.frequency === option.value
                              ? "routine-modal__chip--active"
                              : ""
                          }`}
                          key={option.value}
                          onClick={() =>
                            setRoutineDraft((current) => ({
                              ...current,
                              frequency: option.value,
                              weekDays:
                                option.value === "monthly" ? [] : current.weekDays,
                              monthDates:
                                option.value === "monthly"
                                  ? current.monthDates
                                  : [],
                            }))
                          }
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {routineDraft.frequency === "weekly" ||
                  routineDraft.frequency === "bi-weekly" ? (
                    <div className="routine-modal__field">
                      <span className="routine-modal__label">Select weekdays</span>
                      <div className="routine-modal__grid routine-modal__grid--week">
                        {WEEK_DAY_OPTIONS.map((option) => (
                          <button
                            className={`routine-modal__grid-chip ${
                              routineDraft.weekDays.includes(option.value)
                                ? "routine-modal__grid-chip--active"
                                : ""
                            }`}
                            key={option.value}
                            onClick={() => toggleRoutineWeekDay(option.value)}
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {routineDraft.frequency === "monthly" ? (
                    <div className="routine-modal__field">
                      <span className="routine-modal__label">Select dates</span>
                      <div className="routine-modal__grid routine-modal__grid--month">
                        {MONTH_DATE_OPTIONS.map((option) => (
                          <button
                            className={`routine-modal__grid-chip ${
                              routineDraft.monthDates.includes(option)
                                ? "routine-modal__grid-chip--active"
                                : ""
                            }`}
                            key={option}
                            onClick={() => toggleRoutineMonthDate(option)}
                            type="button"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="routine-modal__footer">
                    <button
                      className="daily-planner__toolbar-button"
                      onClick={closeRoutineModal}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="daily-planner__toolbar-button daily-planner__toolbar-button--active"
                      onClick={createRoutine}
                      type="button"
                    >
                      {routineTarget ? "Save routine" : "Create routine"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isMounted && taskMenu
        ? createPortal(
            <div
              className="daily-planner__task-menu"
              ref={taskMenuRef}
              style={{ left: taskMenu.x, top: taskMenu.y }}
            >
              <button
                className="daily-planner__task-menu-item"
                onClick={() => startEditingTask(taskMenu)}
                type="button"
              >
                Edit
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => deleteTask(taskMenu)}
                type="button"
              >
                Delete
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => openReminderForTarget(taskMenu)}
                type="button"
              >
                Set reminder
              </button>
              {taskMenu.task.source !== "routine" ? (
                <button
                  className="daily-planner__task-menu-item"
                  onClick={() => moveTaskToRoutine(taskMenu)}
                  type="button"
                >
                  Move to routine
                </button>
              ) : null}
              {taskMenu.type !== "dump-active" && taskMenu.type !== "dump-completed" ? (
                <button
                  className="daily-planner__task-menu-item"
                  onClick={() => moveTaskToDump(taskMenu)}
                  type="button"
                >
                  Move to task dump
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {isMounted && moveMenu
        ? createPortal(
            <div
              className="daily-planner__task-menu"
              ref={moveMenuRef}
              style={{ left: moveMenu.x, top: moveMenu.y }}
            >
              <button
                className="daily-planner__task-menu-item"
                onClick={() => openReminderForTarget(moveMenu.target)}
                type="button"
              >
                Set reminder
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => moveTaskToDump(moveMenu.target)}
                type="button"
              >
                Move to task dump
              </button>
              {moveMenu.target.task.source !== "routine" ? (
                <button
                  className="daily-planner__task-menu-item"
                  onClick={() => moveTaskToRoutine(moveMenu.target)}
                  type="button"
                >
                  Move to routine
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {isMounted && routineMenu
        ? createPortal(
            <div
              className="daily-planner__task-menu"
              ref={routineMenuRef}
              style={{ left: routineMenu.x, top: routineMenu.y }}
            >
              <button
                className="daily-planner__task-menu-item"
                onClick={() => editRoutine(routineMenu.routine)}
                type="button"
              >
                Edit
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => deleteRoutineFromMenu(routineMenu.routine.id)}
                type="button"
              >
                Delete
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => openReminderForRoutine(routineMenu.routine)}
                type="button"
              >
                Set reminder
              </button>
              <button
                className="daily-planner__task-menu-item"
                onClick={() => moveRoutineToDump(routineMenu.routine)}
                type="button"
              >
                Move to task dump
              </button>
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function buildVisibleDay(date: Date) {
  return {
    date,
    fullDate: formatPlannerCardDate(date),
    isToday: toDateKey(date) === initialTodayKey,
    key: toDateKey(date),
  }
}

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startDate = addDays(firstDay, -firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => ({
    date: addDays(startDate, index),
  }))
}

function buildCurrentWeek(date: Date) {
  const start = addDays(date, -date.getDay())

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = addDays(start, index)

    return {
      key: toDateKey(nextDate),
      shortLabel: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
      }).format(nextDate),
      dayNumber: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
      }).format(nextDate),
    }
  })
}

function formatCalendarMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date)
}

function formatToolbarDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    weekday: "short",
    year: "numeric",
  }).format(date)
}

function formatSelectedDateLabel(date: Date) {
  if (toDateKey(date) === initialTodayKey) {
    return "Today"
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date)
}

function formatPlannerCardDate(date: Date) {
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

function createTask(title: string, source: PlannerTask["source"]): PlannerTask {
  return {
    id: `${source}-${Math.random().toString(36).slice(2, 9)}`,
    source,
    title,
  }
}

function describeRoutine(routine: RoutineRule) {
  if (routine.frequency === "daily") {
    return "every day"
  }

  if (routine.frequency === "weekly") {
    return routine.weekDays
      .map((day) => WEEK_DAY_OPTIONS.find((option) => option.value === day)?.label)
      .filter(Boolean)
      .join(", ")
  }

  if (routine.frequency === "bi-weekly") {
    return `alternate ${routine.weekDays
      .map((day) => WEEK_DAY_OPTIONS.find((option) => option.value === day)?.label)
      .filter(Boolean)
      .join(", ")}`
  }

  return routine.monthDates.join(", ")
}

function formatFrequencyLabel(frequency: RoutineFrequency) {
  return routineFrequencyOptions.find((option) => option.value === frequency)?.label
}

function matchesRoutineDate(routine: RoutineRule, date: Date) {
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

function diffInWeeks(start: Date, end: Date) {
  const milliseconds = Math.abs(end.getTime() - start.getTime())
  return Math.floor(milliseconds / (1000 * 60 * 60 * 24 * 7))
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

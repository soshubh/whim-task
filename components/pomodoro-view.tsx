"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  CalendarDays,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Pause,
  PencilLine,
  PictureInPicture2,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { usePlanner } from "@/components/planner-provider"
import { buildReminderPickerTarget } from "@/components/reminder-picker-modal"
import { useReminderUi } from "@/components/reminder-ui-provider"
import {
  PomodoroMiniPlayer,
} from "@/components/pomodoro-mini-player"
import { TaskRow, type TaskRowAction } from "@/components/task-row"
import {
  closeDocumentPictureInPictureWindow,
  isDocumentPictureInPictureSupported,
  openDocumentPictureInPictureWindow,
  type DocumentPictureInPictureWindow,
} from "@/lib/pomodoro-pip"
import {
  DEFAULT_POMODORO_TIMER_VALUES,
  loadPomodoroTimerDefaults,
  minutesToSeconds,
  POMODORO_TIMER_LABELS,
  savePomodoroTimerDefaults,
  secondsToMinutes,
  type PomodoroTimerDefaults,
  type PomodoroTimerMode,
} from "@/lib/pomodoro-timer"
import {
  addPomodoroSessionLog,
  getElapsedFocusSeconds,
  loadFocusSessionCount,
} from "@/lib/pomodoro-sessions"
import { APP_DATA_SYNCED_EVENT } from "@/lib/app-data-sync"
import {
  addDays,
  buildCalendarDays,
  createTask,
  formatCalendarMonth,
  formatSelectedDateLabel,
  getPendingTasksForDay,
  isTodayDate,
  stripTime,
  toDateKey,
  WEEK_DAY_OPTIONS,
  type PlannerTask,
} from "@/lib/planner"

type TimerMode = PomodoroTimerMode

const TIMER_LABELS = POMODORO_TIMER_LABELS

const QUICK_ADD_OPTIONS = [
  { label: "+ 25 min", seconds: 25 * 60 },
  { label: "+ 10 min", seconds: 10 * 60 },
  { label: "+ 5 min", seconds: 5 * 60 },
  { label: "+ 1 min", seconds: 60 },
] as const

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${`${remainder}`.padStart(2, "0")}`
}

type EditingTaskState = {
  dateKey: string
  task: PlannerTask
  value: string
}

type SettingsDraft = Record<TimerMode, string>

function createSettingsDraft(defaults: PomodoroTimerDefaults): SettingsDraft {
  return {
    focus: String(secondsToMinutes(defaults.focus)),
    "short-break": String(secondsToMinutes(defaults["short-break"])),
    "long-break": String(secondsToMinutes(defaults["long-break"])),
  }
}

function parseSettingsDraft(draft: SettingsDraft): PomodoroTimerDefaults | null {
  const focusMinutes = Number.parseInt(draft.focus, 10)
  const shortBreakMinutes = Number.parseInt(draft["short-break"], 10)
  const longBreakMinutes = Number.parseInt(draft["long-break"], 10)

  if (
    !Number.isFinite(focusMinutes) ||
    !Number.isFinite(shortBreakMinutes) ||
    !Number.isFinite(longBreakMinutes) ||
    focusMinutes < 1 ||
    shortBreakMinutes < 1 ||
    longBreakMinutes < 1 ||
    focusMinutes > 180 ||
    shortBreakMinutes > 60 ||
    longBreakMinutes > 120
  ) {
    return null
  }

  return {
    focus: minutesToSeconds(focusMinutes),
    "short-break": minutesToSeconds(shortBreakMinutes),
    "long-break": minutesToSeconds(longBreakMinutes),
  }
}

export function PomodoroView() {
  const {
    plannerState,
    removeRemindersForRoutine,
    removeRemindersForTask,
    routines,
    setRoutines,
    updateDay,
  } = usePlanner()
  const { openReminderPicker } = useReminderUi()
  const isMobile = useIsMobile()
  const [selectedDate, setSelectedDate] = React.useState(() => stripTime(new Date()))
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false)
  const [calendarMonth, setCalendarMonth] = React.useState(() =>
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  )
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null)
  const [editingTask, setEditingTask] = React.useState<EditingTaskState | null>(null)
  const [timerMode, setTimerMode] = React.useState<TimerMode>("focus")
  const [timerDefaults, setTimerDefaults] = React.useState<PomodoroTimerDefaults>(
    DEFAULT_POMODORO_TIMER_VALUES,
  )
  const [secondsRemaining, setSecondsRemaining] = React.useState(
    DEFAULT_POMODORO_TIMER_VALUES.focus,
  )
  const [isRunning, setIsRunning] = React.useState(false)
  const [hasStarted, setHasStarted] = React.useState(false)
  const [sessionTotalSeconds, setSessionTotalSeconds] = React.useState(0)
  const [sessionsToday, setSessionsToday] = React.useState(0)
  const [showSettings, setShowSettings] = React.useState(false)
  const [settingsDraft, setSettingsDraft] = React.useState<SettingsDraft>(() =>
    createSettingsDraft(DEFAULT_POMODORO_TIMER_VALUES),
  )
  const [isMounted, setIsMounted] = React.useState(false)
  const [isPipFallbackOpen, setIsPipFallbackOpen] = React.useState(false)
  const [pipWindow, setPipWindow] =
    React.useState<DocumentPictureInPictureWindow | null>(null)
  const [pipMountNode, setPipMountNode] = React.useState<HTMLElement | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const timerPanelRef = React.useRef<HTMLDivElement>(null)
  const datePickerRef = React.useRef<HTMLDivElement>(null)

  const selectedDateKey = toDateKey(selectedDate)
  const isToday = isTodayDate(selectedDate)

  const dayState =
    plannerState[selectedDateKey] ?? {
      tasks: [],
      completed: [],
      draft: "",
      isAdding: false,
      showCompleted: false,
    }

  const pendingTasks = React.useMemo(
    () => getPendingTasksForDay(plannerState, routines, selectedDate),
    [plannerState, routines, selectedDate],
  )

  const focusedTaskIdRef = React.useRef(focusedTaskId)
  const timerModeRef = React.useRef(timerMode)
  const sessionTotalSecondsRef = React.useRef(sessionTotalSeconds)
  const pendingTasksRef = React.useRef(pendingTasks)

  React.useEffect(() => {
    focusedTaskIdRef.current = focusedTaskId
  }, [focusedTaskId])

  React.useEffect(() => {
    timerModeRef.current = timerMode
  }, [timerMode])

  React.useEffect(() => {
    sessionTotalSecondsRef.current = sessionTotalSeconds
  }, [sessionTotalSeconds])

  React.useEffect(() => {
    pendingTasksRef.current = pendingTasks
  }, [pendingTasks])

  const recordFocusSession = React.useCallback(
    (task: PlannerTask, elapsedSeconds: number) => {
      const dateKey = toDateKey(new Date())
      const nextLogs = addPomodoroSessionLog(dateKey, {
        durationSeconds: Math.max(1, Math.round(elapsedSeconds)),
        taskId: task.id,
        taskTitle: task.title,
      })

      setSessionsToday(nextLogs.length)
    },
    [],
  )

  const focusedTask = focusedTaskId
    ? pendingTasks.find((task) => task.id === focusedTaskId) ?? null
    : null

  const timerPhase = !hasStarted ? "idle" : isRunning ? "running" : "paused"
  const timerProgress =
    sessionTotalSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((sessionTotalSeconds - secondsRemaining) / sessionTotalSeconds) * 100,
          ),
        )
      : 0

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  React.useEffect(() => {
    const storedDefaults = loadPomodoroTimerDefaults()
    setTimerDefaults(storedDefaults)
    setSecondsRemaining(storedDefaults.focus)
    setSettingsDraft(createSettingsDraft(storedDefaults))
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const stored = loadFocusSessionCount(toDateKey(new Date()))
    setSessionsToday(stored)
  }, [])

  React.useEffect(() => {
    const refreshPomodoroData = () => {
      const storedDefaults = loadPomodoroTimerDefaults()
      setTimerDefaults(storedDefaults)
      setSessionsToday(loadFocusSessionCount(toDateKey(new Date())))
    }

    window.addEventListener(APP_DATA_SYNCED_EVENT, refreshPomodoroData)

    return () => {
      window.removeEventListener(APP_DATA_SYNCED_EVENT, refreshPomodoroData)
    }
  }, [])

  React.useEffect(() => {
    if (!focusedTaskId) {
      return
    }

    if (!pendingTasks.some((task) => task.id === focusedTaskId)) {
      setFocusedTaskId(null)
      setIsRunning(false)
      setHasStarted(false)
      setSessionTotalSeconds(0)
      setSecondsRemaining(timerDefaults[timerMode])
    }
  }, [focusedTaskId, pendingTasks, timerDefaults, timerMode])

  React.useEffect(() => {
    if (!isRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          const totalSeconds = sessionTotalSecondsRef.current
          const elapsedSeconds = getElapsedFocusSeconds(totalSeconds, 0)
          const activeTaskId = focusedTaskIdRef.current
          const activeTask =
            activeTaskId != null
              ? pendingTasksRef.current.find((task) => task.id === activeTaskId)
              : null

          if (timerModeRef.current === "focus" && activeTask) {
            recordFocusSession(activeTask, elapsedSeconds)
          }

          setIsRunning(false)
          setHasStarted(false)
          setSessionTotalSeconds(0)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isRunning, recordFocusSession, timerMode])

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  React.useEffect(() => {
    if (!showSettings) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSettings(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showSettings])

  React.useEffect(() => {
    if (!isCalendarOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (datePickerRef.current?.contains(target)) {
        return
      }

      setIsCalendarOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
    }
  }, [isCalendarOpen])

  React.useEffect(() => {
    if (!pipWindow) {
      setPipMountNode(null)
      return
    }

    const handlePageHide = () => {
      setPipWindow(null)
      setPipMountNode(null)
    }

    pipWindow.addEventListener("pagehide", handlePageHide)
    setPipMountNode(pipWindow.document.body)

    return () => {
      pipWindow.removeEventListener("pagehide", handlePageHide)
    }
  }, [pipWindow])

  React.useEffect(() => {
    return () => {
      closeDocumentPictureInPictureWindow(pipWindow)
    }
  }, [pipWindow])

  const closeMiniPlayer = React.useCallback(() => {
    closeDocumentPictureInPictureWindow(pipWindow)
    setPipWindow(null)
    setPipMountNode(null)
    setIsPipFallbackOpen(false)
  }, [pipWindow])

  const handleModeChange = (mode: TimerMode) => {
    setTimerMode(mode)
    setSecondsRemaining(timerDefaults[mode])
    setIsRunning(false)
    setHasStarted(false)
    setSessionTotalSeconds(0)
  }

  const handleQuickAdd = (seconds: number) => {
    setSecondsRemaining((current) => current + seconds)

    if (hasStarted) {
      setSessionTotalSeconds((current) => current + seconds)
    }
  }

  const handleStart = () => {
    const nextSeconds =
      secondsRemaining === 0 ? timerDefaults[timerMode] : secondsRemaining

    setSecondsRemaining(nextSeconds)
    setSessionTotalSeconds(nextSeconds)
    setHasStarted(true)
    setIsRunning(true)
  }

  const handlePause = () => {
    setIsRunning(false)
  }

  const handleResume = () => {
    setIsRunning(true)
  }

  const handleStartPause = () => {
    if (!hasStarted) {
      handleStart()
      return
    }

    if (isRunning) {
      handlePause()
      return
    }

    handleResume()
  }

  const handleResetTimer = () => {
    setIsRunning(false)
    setHasStarted(false)
    setSessionTotalSeconds(0)
    setSecondsRemaining(timerDefaults[timerMode])
  }

  const openSettings = () => {
    setSettingsDraft(createSettingsDraft(timerDefaults))
    setShowSettings(true)
  }

  const closeSettings = () => {
    setShowSettings(false)
  }

  const handleSettingsDraftChange = (mode: TimerMode, value: string) => {
    setSettingsDraft((current) => ({
      ...current,
      [mode]: value,
    }))
  }

  const handleUpdateSettings = () => {
    const nextDefaults = parseSettingsDraft(settingsDraft)

    if (!nextDefaults) {
      return
    }

    setTimerDefaults(nextDefaults)
    savePomodoroTimerDefaults(nextDefaults)

    if (!isRunning && !hasStarted) {
      setSecondsRemaining(nextDefaults[timerMode])
    }

    setShowSettings(false)
  }

  const handleCompleteTask = (task: PlannerTask) => {
    updateDay(selectedDateKey, (day) => {
      const nextManualTasks =
        task.source === "manual"
          ? day.tasks.filter((entry) => entry.id !== task.id)
          : day.tasks

      if (day.completed.some((entry) => entry.id === task.id)) {
        return day
      }

      return {
        ...day,
        tasks: nextManualTasks,
        completed: [...day.completed, task],
      }
    })

    if (focusedTaskId === task.id) {
      if (hasStarted) {
        recordFocusSession(
          task,
          getElapsedFocusSeconds(sessionTotalSeconds, secondsRemaining),
        )
      }

      setFocusedTaskId(null)
      handleResetTimer()
    }
  }

  const handleCompleteFocusedTask = (task: PlannerTask) => {
    handleCompleteTask(task)
  }

  const handleDismissFocusedTask = () => {
    setFocusedTaskId(null)
    handleResetTimer()
  }

  const handleAddTask = () => {
    updateDay(selectedDateKey, (day) => ({
      ...day,
      isAdding: true,
    }))
  }

  const handleDraftChange = (draft: string) => {
    updateDay(selectedDateKey, (day) => ({
      ...day,
      draft,
    }))
  }

  const handleDraftSubmit = () => {
    const title = dayState.draft.trim()

    if (!title) {
      handleDraftCancel()
      return
    }

    const task = createTask(title, "manual")

    updateDay(selectedDateKey, (day) => ({
      ...day,
      tasks: [...day.tasks, task],
      draft: "",
      isAdding: false,
    }))
    setFocusedTaskId(task.id)
  }

  const handleDraftCancel = () => {
    updateDay(selectedDateKey, (day) => ({
      ...day,
      draft: "",
      isAdding: false,
    }))
  }

  const toggleCompletedTasks = () => {
    updateDay(selectedDateKey, (day) => ({
      ...day,
      showCompleted: !day.showCompleted,
    }))
  }

  const restoreCompletedTask = (taskId: string) => {
    updateDay(selectedDateKey, (day) => {
      const task = day.completed.find((entry) => entry.id === taskId)

      if (!task) {
        return day
      }

      return {
        ...day,
        tasks: [...day.tasks, task],
        completed: day.completed.filter((entry) => entry.id !== taskId),
      }
    })
  }

  const startEditingTask = (task: PlannerTask, dateKey: string) => {
    setEditingTask({
      dateKey,
      task,
      value: task.title,
    })
  }

  const saveEditingTask = () => {
    if (!editingTask) {
      return
    }

    const title = editingTask.value.trim()

    if (!title) {
      setEditingTask(null)
      return
    }

    if (editingTask.task.source === "routine" && editingTask.task.routineId) {
      setRoutines((current) =>
        current.map((routine) =>
          routine.id === editingTask.task.routineId
            ? { ...routine, title }
            : routine,
        ),
      )
      setEditingTask(null)
      return
    }

    updateDay(editingTask.dateKey, (day) => ({
      ...day,
      tasks: day.tasks.map((entry) =>
        entry.id === editingTask.task.id ? { ...entry, title } : entry,
      ),
      completed: day.completed.map((entry) =>
        entry.id === editingTask.task.id ? { ...entry, title } : entry,
      ),
    }))
    setEditingTask(null)
  }

  const deleteTask = (task: PlannerTask, dateKey: string) => {
    if (task.source === "routine" && task.routineId) {
      removeRemindersForRoutine(task.routineId)
      setRoutines((current) =>
        current.filter((routine) => routine.id !== task.routineId),
      )
    } else {
      removeRemindersForTask(task.id)
      updateDay(dateKey, (day) => ({
        ...day,
        tasks: day.tasks.filter((entry) => entry.id !== task.id),
        completed: day.completed.filter((entry) => entry.id !== task.id),
      }))
    }

    if (focusedTaskId === task.id) {
      setFocusedTaskId(null)
      handleResetTimer()
    }

    if (editingTask?.task.id === task.id) {
      setEditingTask(null)
    }
  }

  const handlePlayPauseTask = (task: PlannerTask) => {
    if (focusedTaskId === task.id) {
      handleStartPause()
      return
    }

    setFocusedTaskId(task.id)
    handleResetTimer()
    handleStart()
  }

  const buildPomodoroTaskActions = (
    task: PlannerTask,
    dateKey: string,
  ): TaskRowAction[] => {
    const isFocusedTask = focusedTaskId === task.id
    const isTimerRunning = isFocusedTask && isRunning

    return [
      {
        key: "play",
        active: isTimerRunning,
        label: isTimerRunning ? "Pause timer" : "Start timer",
        icon: isTimerRunning ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        ),
        onClick: (event) => {
          event.stopPropagation()
          handlePlayPauseTask(task)
        },
      },
      {
        key: "edit",
        label: "Edit task",
        icon: <PencilLine className="size-4" />,
        onClick: (event) => {
          event.stopPropagation()
          startEditingTask(task, dateKey)
        },
      },
      {
        key: "reminder",
        label: "Set reminder",
        icon: <Bell className="size-4" />,
        onClick: (event) => {
          event.stopPropagation()
          openReminderPicker(buildReminderPickerTarget(task, dateKey))
        },
      },
      {
        key: "delete",
        label: "Delete task",
        icon: <Trash2 className="size-4" />,
        onClick: (event) => {
          event.stopPropagation()
          deleteTask(task, dateKey)
        },
      },
    ]
  }

  const renderTaskLabel = (
    task: PlannerTask,
    dateKey: string,
    options?: {
      completed?: boolean
      meta?: string
    },
  ) => {
    if (
      editingTask?.task.id === task.id &&
      editingTask.dateKey === dateKey
    ) {
      return (
        <input
          autoFocus
          className="daily-planner__task-editor"
          onBlur={saveEditingTask}
          onChange={(event) =>
            setEditingTask((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
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
          {task.title}
        </span>
        {options?.meta ? (
          <span className="daily-planner__task-meta" aria-label={options.meta} />
        ) : null}
      </>
    )
  }

  const isTaskEditing = (task: PlannerTask, dateKey: string) =>
    editingTask?.task.id === task.id && editingTask.dateKey === dateKey

  const handleToggleFullscreen = async () => {
    if (!timerPanelRef.current) {
      return
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    await timerPanelRef.current.requestFullscreen()
  }

  const restoreMiniPlayer = React.useCallback(() => {
    closeMiniPlayer()
  }, [closeMiniPlayer])

  const miniPlayerProps = {
    hasStarted,
    isRunning,
    onClose: closeMiniPlayer,
    onModeChange: handleModeChange,
    onQuickAdd: handleQuickAdd,
    onReset: handleResetTimer,
    onRestore: restoreMiniPlayer,
    onStartPause: handleStartPause,
    secondsRemaining,
    timerMode,
    timerProgress,
  }

  const renderMiniPlayer = (variant: "fallback" | "pip") => (
    <PomodoroMiniPlayer {...miniPlayerProps} variant={variant} />
  )

  const handlePictureInPicture = async () => {
    if (pipWindow || isPipFallbackOpen) {
      closeMiniPlayer()
      return
    }

    if (isDocumentPictureInPictureSupported()) {
      try {
        const nextPipWindow = await openDocumentPictureInPictureWindow()

        if (!nextPipWindow) {
          setIsPipFallbackOpen(true)
          return
        }

        setPipWindow(nextPipWindow)
        return
      } catch {
        setIsPipFallbackOpen(true)
        return
      }
    }

    setIsPipFallbackOpen(true)
  }

  const renderCalendarPopover = () => {
    const days = buildCalendarDays(calendarMonth)
    const todayKey = toDateKey(stripTime(new Date()))

    return (
      <div className="daily-planner__calendar" role="dialog">
        <div className="daily-planner__calendar-header">
          <button
            aria-label="Previous month"
            className="daily-planner__icon-button"
            onClick={() =>
              setCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
            type="button"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="daily-planner__calendar-title">
            {formatCalendarMonth(calendarMonth)}
          </span>
          <button
            aria-label="Next month"
            className="daily-planner__icon-button"
            onClick={() =>
              setCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
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
            const dayKey = toDateKey(day.date)
            const isSelected = dayKey === selectedDateKey
            const isCurrentMonth = day.date.getMonth() === calendarMonth.getMonth()
            const isTodayDay = dayKey === todayKey

            return (
              <button
                className={`daily-planner__calendar-day ${
                  isSelected ? "daily-planner__calendar-day--selected" : ""
                } ${isTodayDay ? "daily-planner__calendar-day--today" : ""} ${
                  !isCurrentMonth ? "daily-planner__calendar-day--muted" : ""
                }`}
                key={dayKey}
                onClick={() => {
                  const nextDate = stripTime(day.date)
                  setSelectedDate(nextDate)
                  setCalendarMonth(
                    new Date(nextDate.getFullYear(), nextDate.getMonth(), 1),
                  )
                  setIsCalendarOpen(false)
                }}
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

  return (
    <section className="pomodoro" aria-label="Pomodoro">
      <div className="pomodoro__layout">
        <aside
          className={`pomodoro__tasks daily-planner__day ${
            isToday ? "daily-planner__day--today" : ""
          }`}
        >
          {isMobile ? (
            <header className="daily-planner__day-header pomodoro__day-header pomodoro__day-header--mobile">
              <h2 className="daily-planner__day-date pomodoro__day-title">
                Today&apos;s Tasks
              </h2>

              <div className="pomodoro__date-nav" ref={datePickerRef}>
                <button
                  aria-expanded={isCalendarOpen}
                  aria-label="Open calendar"
                  className="daily-planner__icon-button"
                  onClick={() => {
                    setCalendarMonth(
                      new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        1,
                      ),
                    )
                    setIsCalendarOpen((current) => !current)
                  }}
                  type="button"
                >
                  <CalendarDays className="size-4" />
                </button>

                {isCalendarOpen ? renderCalendarPopover() : null}
              </div>
            </header>
          ) : (
            <header
              className={`daily-planner__day-header pomodoro__day-header pomodoro__day-header--desktop ${
                !isToday ? "pomodoro__day-header--tasks-only" : ""
              }`}
            >
              {isToday ? (
                <div className="pomodoro__day-heading">
                  <h2 className="daily-planner__day-date pomodoro__day-title">
                    Today&apos;s Tasks
                  </h2>
                </div>
              ) : null}

              <div className="daily-planner__toolbar-actions pomodoro__day-toolbar">
                <button
                  className="daily-planner__toolbar-button daily-planner__date-button"
                  onClick={() => setSelectedDate(stripTime(new Date()))}
                  type="button"
                >
                  {formatSelectedDateLabel(selectedDate)}
                </button>

                <div className="daily-planner__date-picker" ref={datePickerRef}>
                  <button
                    aria-label="Open calendar"
                    className="daily-planner__toolbar-button"
                    onClick={() => {
                      setCalendarMonth(
                        new Date(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          1,
                        ),
                      )
                      setIsCalendarOpen((current) => !current)
                    }}
                    type="button"
                  >
                    <CalendarDays className="size-4" />
                  </button>

                  {isCalendarOpen ? renderCalendarPopover() : null}
                </div>

                <button
                  aria-label="Previous day"
                  className="daily-planner__icon-button"
                  onClick={() => setSelectedDate((date) => addDays(date, -1))}
                  type="button"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  aria-label="Next day"
                  className="daily-planner__icon-button"
                  onClick={() => setSelectedDate((date) => addDays(date, 1))}
                  type="button"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </header>
          )}

          <div className="daily-planner__day-body">
            {pendingTasks.length > 0 ? (
              <div className="daily-planner__task-list">
                {pendingTasks.map((task) => (
                  <TaskRow
                    actions={buildPomodoroTaskActions(task, selectedDateKey)}
                    checkboxLabel={`Mark ${task.title} complete`}
                    className={`${
                      focusedTask?.id === task.id
                        ? "pomodoro__task-row--focused"
                        : ""
                    } ${
                      isTaskEditing(task, selectedDateKey)
                        ? "daily-planner__task-row--editing"
                        : ""
                    }`.trim()}
                    key={task.id}
                    onCheckboxClick={() => handleCompleteTask(task)}
                    onDoubleClick={() => startEditingTask(task, selectedDateKey)}
                    showCheckbox
                    variant="day"
                  >
                    {renderTaskLabel(task, selectedDateKey, {
                      meta: task.source === "routine" ? "Routine" : undefined,
                    })}
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
                    handleDraftSubmit()
                    return
                  }

                  handleDraftCancel()
                }}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleDraftSubmit()
                  }

                  if (event.key === "Escape") {
                    handleDraftCancel()
                  }
                }}
                placeholder="Type a task and press Enter"
                value={dayState.draft}
              />
            ) : (
              <button
                className={`daily-planner__add-task ${
                  pendingTasks.length === 0 && dayState.completed.length === 0
                    ? "daily-planner__add-task--empty"
                    : ""
                }`}
                onClick={handleAddTask}
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
                  onClick={toggleCompletedTasks}
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
                        actions={[
                          {
                            key: "edit",
                            label: "Edit task",
                            icon: <PencilLine className="size-4" />,
                            onClick: (event) => {
                              event.stopPropagation()
                              startEditingTask(task, selectedDateKey)
                            },
                          },
                          {
                            key: "delete",
                            label: "Delete task",
                            icon: <Trash2 className="size-4" />,
                            onClick: (event) => {
                              event.stopPropagation()
                              deleteTask(task, selectedDateKey)
                            },
                          },
                        ]}
                        checkboxChecked
                        checkboxLabel={`Restore ${task.title}`}
                        className={
                          isTaskEditing(task, selectedDateKey)
                            ? "daily-planner__task-row--editing"
                            : ""
                        }
                        key={task.id}
                        onCheckboxClick={() => restoreCompletedTask(task.id)}
                        onDoubleClick={() => startEditingTask(task, selectedDateKey)}
                        showCheckbox
                        variant="day-completed"
                      >
                        {renderTaskLabel(task, selectedDateKey, {
                          completed: true,
                          meta: task.source === "routine" ? "Routine" : undefined,
                        })}
                      </TaskRow>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="pomodoro__timer-panel" ref={timerPanelRef}>
          <div className="pomodoro__timer-top">
            {focusedTask ? (
              <div className="pomodoro__task-pill">
                <button
                  aria-label={`Mark ${focusedTask.title} complete`}
                  className="pomodoro__task-pill-button"
                  onClick={() => handleCompleteFocusedTask(focusedTask)}
                  type="button"
                >
                  <Check className="size-4" />
                </button>
                <span className="pomodoro__task-pill-label">{focusedTask.title}</span>
                <button
                  aria-label={`Remove ${focusedTask.title} from focus and reset timer`}
                  className="pomodoro__task-pill-button"
                  onClick={handleDismissFocusedTask}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}

            <div className="pomodoro__timer-actions">
              <button
                aria-label={
                  pipWindow || isPipFallbackOpen
                    ? "Close picture in picture"
                    : "Open picture in picture"
                }
                className={`pomodoro__icon-button ${
                  pipWindow || isPipFallbackOpen
                    ? "pomodoro__icon-button--active"
                    : ""
                }`}
                onClick={handlePictureInPicture}
                type="button"
              >
                <PictureInPicture2 className="size-4" />
              </button>
              <button
                aria-label="Timer settings"
                className={`pomodoro__icon-button ${
                  showSettings ? "pomodoro__icon-button--active" : ""
                }`}
                onClick={openSettings}
                type="button"
              >
                <SlidersHorizontal className="size-4" />
              </button>
              <button
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="pomodoro__icon-button"
                onClick={handleToggleFullscreen}
                type="button"
              >
                <Maximize2 className="size-4" />
              </button>
            </div>
          </div>

          <div className="pomodoro__timer-body">
            <div className="pomodoro__mode-tabs" role="tablist">
              {(Object.keys(TIMER_LABELS) as TimerMode[]).map((mode) => (
                <button
                  aria-selected={timerMode === mode}
                  className={`pomodoro__mode-tab ${
                    timerMode === mode ? "pomodoro__mode-tab--active" : ""
                  }`}
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  role="tab"
                  type="button"
                >
                  {TIMER_LABELS[mode]}
                </button>
              ))}
            </div>

            <div className="pomodoro__timer-display" aria-live="polite">
              {formatTimer(secondsRemaining)}
            </div>

            <div
              aria-hidden="true"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={hasStarted ? timerProgress : 0}
              className="pomodoro__timer-divider"
              role="progressbar"
            >
              <span
                className="pomodoro__timer-divider-fill"
                style={{ width: hasStarted ? `${timerProgress}%` : "0%" }}
              />
            </div>

            <div className="pomodoro__quick-add">
              {QUICK_ADD_OPTIONS.map((option) => (
                <button
                  className="pomodoro__quick-add-button"
                  key={option.label}
                  onClick={() => handleQuickAdd(option.seconds)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div
              className={`pomodoro__controls ${
                timerPhase !== "idle" ? "pomodoro__controls--dual" : ""
              }`}
            >
              {timerPhase === "idle" ? (
                <button
                  className="pomodoro__start-button"
                  onClick={handleStart}
                  type="button"
                >
                  Start
                </button>
              ) : null}

              {timerPhase === "running" ? (
                <>
                  <button
                    className="pomodoro__start-button"
                    onClick={handlePause}
                    type="button"
                  >
                    Pause
                  </button>
                  <button
                    className="pomodoro__reset-button pomodoro__reset-button--filled"
                    onClick={handleResetTimer}
                    type="button"
                  >
                    Reset
                  </button>
                </>
              ) : null}

              {timerPhase === "paused" ? (
                <>
                  <button
                    className="pomodoro__start-button"
                    onClick={handleResume}
                    type="button"
                  >
                    Resume
                  </button>
                  <button
                    className="pomodoro__reset-button pomodoro__reset-button--filled"
                    onClick={handleResetTimer}
                    type="button"
                  >
                    Reset
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <p className="pomodoro__sessions">
            {sessionsToday > 0
              ? `${sessionsToday} focus ${
                  sessionsToday === 1 ? "session" : "sessions"
                } today`
              : "No sessions today"}
          </p>
        </div>
      </div>

      {pipMountNode ? createPortal(renderMiniPlayer("pip"), pipMountNode) : null}

      {isPipFallbackOpen ? (
        <div className="pomodoro-pip-fallback">{renderMiniPlayer("fallback")}</div>
      ) : null}

      {isMounted && showSettings
        ? createPortal(
            <div
              aria-labelledby="pomodoro-settings-title"
              aria-modal="true"
              className="pomodoro-settings-modal"
              onClick={closeSettings}
              role="dialog"
            >
              <div
                className="pomodoro-settings-modal__panel"
                onClick={(event) => event.stopPropagation()}
              >
                <h3 className="pomodoro-settings-modal__title" id="pomodoro-settings-title">
                  Timer settings
                </h3>

                <div className="pomodoro-settings-modal__body">
                  <label className="pomodoro-settings-modal__field">
                    <span className="pomodoro-settings-modal__label">
                      Pomodoro duration (minutes)
                    </span>
                    <input
                      className="pomodoro-settings-modal__input"
                      inputMode="numeric"
                      min={1}
                      onChange={(event) =>
                        handleSettingsDraftChange("focus", event.target.value)
                      }
                      type="number"
                      value={settingsDraft.focus}
                    />
                  </label>

                  <div className="pomodoro-settings-modal__row">
                    <label className="pomodoro-settings-modal__field">
                      <span className="pomodoro-settings-modal__label">
                        Short break (min)
                      </span>
                      <input
                        className="pomodoro-settings-modal__input"
                        inputMode="numeric"
                        min={1}
                        onChange={(event) =>
                          handleSettingsDraftChange("short-break", event.target.value)
                        }
                        type="number"
                        value={settingsDraft["short-break"]}
                      />
                    </label>

                    <label className="pomodoro-settings-modal__field">
                      <span className="pomodoro-settings-modal__label">
                        Long break (min)
                      </span>
                      <input
                        className="pomodoro-settings-modal__input"
                        inputMode="numeric"
                        min={1}
                        onChange={(event) =>
                          handleSettingsDraftChange("long-break", event.target.value)
                        }
                        type="number"
                        value={settingsDraft["long-break"]}
                      />
                    </label>
                  </div>
                </div>

                <button
                  className="pomodoro-settings-modal__submit"
                  onClick={handleUpdateSettings}
                  type="button"
                >
                  Update Settings
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

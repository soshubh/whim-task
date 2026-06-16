"use client"

import * as React from "react"
import { PencilLine, Plus, Trash2, Bell } from "lucide-react"

import { usePlanner } from "@/components/planner-provider"
import { buildReminderPickerTarget } from "@/components/reminder-picker-modal"
import { useReminderUi } from "@/components/reminder-ui-provider"
import { TaskRow, type TaskRowAction } from "@/components/task-row"
import {
  createTask,
  getPendingTasksForDay,
  isTodayDate,
  stripTime,
  toDateKey,
  type PlannerTask,
} from "@/lib/planner"
import { createDraftInputHandlers } from "@/lib/draft-input-handlers"

type EditingTaskState = {
  dateKey: string
  task: PlannerTask
  value: string
}

type TodayTasksPanelProps = {
  className?: string
  date?: Date
  embedded?: boolean
  showHeader?: boolean
}

export function TodayTasksPanel({
  className = "",
  date = stripTime(new Date()),
  embedded = false,
  showHeader = true,
}: TodayTasksPanelProps) {
  const {
    plannerState,
    removeRemindersForRoutine,
    removeRemindersForTask,
    routines,
    setRoutines,
    updateDay,
  } = usePlanner()
  const { openReminderPicker } = useReminderUi()
  const selectedDate = stripTime(date)
  const selectedDateKey = toDateKey(selectedDate)
  const [editingTask, setEditingTask] = React.useState<EditingTaskState | null>(
    null,
  )
  const skipDraftBlurRef = React.useRef<string | null>(null)

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
    [plannerState, routines, selectedDate, selectedDateKey],
  )

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
  }

  const handleDraftCancel = () => {
    updateDay(selectedDateKey, (day) => ({
      ...day,
      draft: "",
      isAdding: false,
    }))
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

  const startEditingTask = (task: PlannerTask) => {
    setEditingTask({
      dateKey: selectedDateKey,
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

  const deleteTask = (task: PlannerTask) => {
    if (task.source === "routine" && task.routineId) {
      removeRemindersForRoutine(task.routineId)
      setRoutines((current) =>
        current.filter((routine) => routine.id !== task.routineId),
      )
    } else {
      removeRemindersForTask(task.id)
      updateDay(selectedDateKey, (day) => ({
        ...day,
        tasks: day.tasks.filter((entry) => entry.id !== task.id),
        completed: day.completed.filter((entry) => entry.id !== task.id),
      }))
    }

    if (editingTask?.task.id === task.id) {
      setEditingTask(null)
    }
  }

  const buildTaskActions = (task: PlannerTask): TaskRowAction[] => [
    {
      key: "edit",
      label: "Edit task",
      icon: <PencilLine className="size-4" />,
      onClick: (event) => {
        event.stopPropagation()
        startEditingTask(task)
      },
    },
    {
      key: "reminder",
      label: "Set reminder",
      icon: <Bell className="size-4" />,
      onClick: (event) => {
        event.stopPropagation()
        openReminderPicker(
          buildReminderPickerTarget(task, selectedDateKey),
        )
      },
    },
    {
      key: "delete",
      label: "Delete task",
      icon: <Trash2 className="size-4" />,
      onClick: (event) => {
        event.stopPropagation()
        deleteTask(task)
      },
    },
  ]

  const isTaskEditing = (task: PlannerTask) =>
    editingTask?.task.id === task.id && editingTask.dateKey === selectedDateKey

  const renderTaskLabel = (
    task: PlannerTask,
    options?: {
      completed?: boolean
      meta?: string
    },
  ) => {
    if (isTaskEditing(task) && editingTask) {
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

  return (
    <div
      className={[
        "today-tasks-panel",
        embedded
          ? "today-tasks-panel--embedded"
          : `daily-planner__day ${
              isTodayDate(selectedDate) ? "daily-planner__day--today" : ""
            }`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showHeader ? (
        <header className="daily-planner__day-header">
          <h2 className="daily-planner__day-date">Today&apos;s tasks</h2>
        </header>
      ) : null}

      <div className="daily-planner__day-body">
        {pendingTasks.length > 0 ? (
          <div className="daily-planner__task-list">
            {pendingTasks.map((task) => (
              <TaskRow
                actions={buildTaskActions(task)}
                checkboxLabel={`Mark ${task.title} complete`}
                className={
                  isTaskEditing(task) ? "daily-planner__task-row--editing" : ""
                }
                key={task.id}
                onCheckboxClick={() => handleCompleteTask(task)}
                onDoubleClick={() => startEditingTask(task)}
                showCheckbox
                variant="day"
              >
                {renderTaskLabel(task, {
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
            {...createDraftInputHandlers({
              id: selectedDateKey,
              draft: dayState.draft,
              skipBlurRef: skipDraftBlurRef,
              onSubmit: handleDraftSubmit,
              onCancel: handleDraftCancel,
            })}
            onChange={(event) => handleDraftChange(event.target.value)}
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
                    actions={buildTaskActions(task)}
                    checkboxChecked
                    checkboxLabel={`Restore ${task.title}`}
                    className={
                      isTaskEditing(task)
                        ? "daily-planner__task-row--editing"
                        : ""
                    }
                    key={task.id}
                    onCheckboxClick={() => restoreCompletedTask(task.id)}
                    onDoubleClick={() => startEditingTask(task)}
                    showCheckbox
                    variant="day-completed"
                  >
                    {renderTaskLabel(task, {
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
    </div>
  )
}

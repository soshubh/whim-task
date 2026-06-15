"use client"

import * as React from "react"
import { X } from "lucide-react"

import {
  buildScheduledAt,
  formatReminderDateTimeLabel,
  formatReminderTimeLabel,
  type Reminder,
  type RoutineReminder,
  type TaskReminder,
} from "@/lib/reminders"

export type ReminderPickerTarget =
  | {
      dateKey: string
      kind: "task"
      taskId: string
      title: string
    }
  | {
      kind: "routine"
      routineId: string
      title: string
    }

type ReminderPickerModalProps = {
  existingReminder?: Reminder
  onClose: () => void
  onSave: (values: {
    dateKey?: string
    time: string
  }) => void
  open: boolean
  target: ReminderPickerTarget | null
}

export function ReminderPickerModal({
  existingReminder,
  onClose,
  onSave,
  open,
  target,
}: ReminderPickerModalProps) {
  const [dateKey, setDateKey] = React.useState("")
  const [time, setTime] = React.useState("09:00")

  React.useEffect(() => {
    if (!open || !target) {
      return
    }

    if (existingReminder?.kind === "task" && target.kind === "task") {
      setDateKey(existingReminder.dateKey)
      setTime(existingReminder.time)
      return
    }

    if (existingReminder?.kind === "routine" && target.kind === "routine") {
      setTime(existingReminder.time)
      return
    }

    if (target.kind === "task") {
      setDateKey(target.dateKey)
      setTime("09:00")
      return
    }

    setTime("08:00")
  }, [existingReminder, open, target])

  if (!open || !target) {
    return null
  }

  const previewLabel =
    target.kind === "task"
      ? formatReminderDateTimeLabel(dateKey || target.dateKey, time)
      : `Every routine day at ${formatReminderTimeLabel(time)}`

  return (
    <div className="reminder-modal" role="presentation">
      <button
        aria-label="Close reminder picker"
        className="reminder-modal__backdrop"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="reminder-modal-title"
        aria-modal="true"
        className="reminder-modal__panel"
        role="dialog"
      >
        <div className="reminder-modal__header">
          <div>
            <h3 className="reminder-modal__title" id="reminder-modal-title">
              Set reminder
            </h3>
            <p className="reminder-modal__subtitle">{target.title}</p>
          </div>
          <button
            aria-label="Close"
            className="reminder-modal__close"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="reminder-modal__body">
          {target.kind === "task" ? (
            <label className="reminder-modal__field">
              <span className="reminder-modal__label">Reminder day</span>
              <input
                className="reminder-modal__input"
                onChange={(event) => setDateKey(event.target.value)}
                type="date"
                value={dateKey || target.dateKey}
              />
            </label>
          ) : (
            <p className="reminder-modal__hint">
              This reminder will fire every time this routine appears on your
              planner, at the time you choose.
            </p>
          )}

          <label className="reminder-modal__field">
            <span className="reminder-modal__label">Reminder time</span>
            <input
              className="reminder-modal__input"
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
          </label>

          <div className="reminder-modal__preview">
            <span className="reminder-modal__preview-label">Preview</span>
            <strong>{previewLabel}</strong>
          </div>
        </div>

        <div className="reminder-modal__footer">
          <button
            className="daily-planner__toolbar-button"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="daily-planner__toolbar-button daily-planner__toolbar-button--active"
            onClick={() =>
              onSave({
                dateKey: target.kind === "task" ? dateKey || target.dateKey : undefined,
                time,
              })
            }
            type="button"
          >
            Save reminder
          </button>
        </div>
      </div>
    </div>
  )
}

export function buildReminderPickerTarget(
  task: {
    id: string
    routineId?: string
    source: string
    title: string
  },
  dateKey: string,
): ReminderPickerTarget {
  if (task.source === "routine" && task.routineId) {
    return {
      kind: "routine",
      routineId: task.routineId,
      title: task.title,
    }
  }

  return {
    kind: "task",
    taskId: task.id,
    dateKey,
    title: task.title,
  }
}

export function getExistingReminderForTarget(
  reminders: Reminder[],
  target: ReminderPickerTarget | null,
) {
  if (!target) {
    return undefined
  }

  if (target.kind === "task") {
    return reminders.find(
      (reminder): reminder is TaskReminder =>
        reminder.kind === "task" && reminder.taskId === target.taskId,
    )
  }

  return reminders.find(
    (reminder): reminder is RoutineReminder =>
      reminder.kind === "routine" && reminder.routineId === target.routineId,
  )
}

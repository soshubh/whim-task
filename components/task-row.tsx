"use client";

import * as React from "react";
import { Check } from "lucide-react";

export type TaskRowVariant =
  | "day"
  | "day-completed"
  | "dump"
  | "dump-completed"
  | "routine";

export type TaskRowAction = {
  active?: boolean;
  icon: React.ReactNode;
  key: string;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export type TaskRowProps = {
  className?: string;
  checkboxChecked?: boolean;
  checkboxLabel: string;
  draggable?: boolean;
  onCheckboxClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onDoubleClick?: () => void;
  onDragEnd?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
  actions?: TaskRowAction[];
  routineFrequency?: React.ReactNode;
  routineSchedule?: React.ReactNode;
  routineTitle?: React.ReactNode;
  showCheckbox?: boolean;
  variant: TaskRowVariant;
  children?: React.ReactNode;
};

export function TaskRow({
  children,
  checkboxChecked,
  checkboxLabel,
  className,
  draggable,
  onCheckboxClick,
  onContextMenu,
  onDoubleClick,
  onDragEnd,
  onDragStart,
  actions,
  routineFrequency,
  routineSchedule,
  routineTitle,
  showCheckbox = true,
  variant,
}: TaskRowProps) {
  const rowClassName =
    variant === "day" || variant === "dump" || variant === "routine"
      ? "daily-planner__task-row"
      : variant === "day-completed" || variant === "dump-completed"
        ? "daily-planner__completed-row"
        : "daily-planner__task-row";

  return (
    <div
      className={`task-row ${rowClassName} ${className ?? ""}`.trim()}
      draggable={draggable}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      {showCheckbox ? (
        <button
          aria-label={checkboxLabel}
          className={`daily-planner__checkbox ${
            checkboxChecked ? "daily-planner__checkbox--checked" : ""
          }`}
          onClick={onCheckboxClick}
          type="button"
        >
          {checkboxChecked ? <Check className="size-3.5" /> : null}
        </button>
      ) : null}

      {variant === "routine" ? (
        <div className="task-row__routine">
          <span className="task-row__routine-chip task-row__routine-chip--secondary">
            {routineSchedule}
          </span>
          <div className="task-row__routine-copy">
            <div className="task-row__routine-title">{routineTitle}</div>
          </div>
        </div>
      ) : (
        <div className="daily-planner__task-copy-block">{children}</div>
      )}

      {actions && actions.length > 0 ? (
        <div className="task-row__actions">
          {actions.map((action) => (
            <button
              aria-label={action.label}
              className={`task-row__action ${
                action.active ? "task-row__action--active" : ""
              }`}
              key={action.key}
              onClick={action.onClick}
              type="button"
            >
              {action.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

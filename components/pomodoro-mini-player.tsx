"use client"

import * as React from "react"
import {
  Coffee,
  Crosshair,
  Footprints,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react"

export type PomodoroMiniPlayerMode = "focus" | "short-break" | "long-break"

const MODE_OPTIONS: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: PomodoroMiniPlayerMode
}[] = [
  { value: "focus", label: "Focus", icon: Crosshair },
  { value: "short-break", label: "Short Break", icon: Coffee },
  { value: "long-break", label: "Long Break", icon: Footprints },
]

const QUICK_ADD_OPTIONS = [
  { label: "+25 min", seconds: 25 * 60 },
  { label: "+10 min", seconds: 10 * 60 },
  { label: "+5 min", seconds: 5 * 60 },
  { label: "+1 min", seconds: 60 },
] as const

type PomodoroMiniPlayerProps = {
  hasStarted: boolean
  isRunning: boolean
  onClose: () => void
  onModeChange: (mode: PomodoroMiniPlayerMode) => void
  onQuickAdd: (seconds: number) => void
  onReset: () => void
  onRestore: () => void
  onStartPause: () => void
  secondsRemaining: number
  timerMode: PomodoroMiniPlayerMode
  timerProgress: number
  variant?: "fallback" | "pip"
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${`${remainder}`.padStart(2, "0")}`
}

export function PomodoroMiniPlayer({
  hasStarted,
  isRunning,
  onClose,
  onModeChange,
  onQuickAdd,
  onReset,
  onRestore,
  onStartPause,
  secondsRemaining,
  timerMode,
  timerProgress,
  variant = "pip",
}: PomodoroMiniPlayerProps) {
  const dragStateRef = React.useRef<{
    offsetX: number
    offsetY: number
    pointerId: number
  } | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const handleTitleBarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (variant !== "fallback" || !panelRef.current) {
      return
    }

    const target = event.target as HTMLElement

    if (target.closest("button")) {
      return
    }

    dragStateRef.current = {
      offsetX: event.clientX - panelRef.current.offsetLeft,
      offsetY: event.clientY - panelRef.current.offsetTop,
      pointerId: event.pointerId,
    }
    panelRef.current.setPointerCapture(event.pointerId)
  }

  const handleTitleBarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current

    if (!dragState || !panelRef.current || dragState.pointerId !== event.pointerId) {
      return
    }

    panelRef.current.style.left = `${event.clientX - dragState.offsetX}px`
    panelRef.current.style.top = `${event.clientY - dragState.offsetY}px`
    panelRef.current.style.right = "auto"
    panelRef.current.style.bottom = "auto"
  }

  const handleTitleBarPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    dragStateRef.current = null
    panelRef.current?.releasePointerCapture(event.pointerId)
  }

  const timerPhase = !hasStarted ? "idle" : isRunning ? "running" : "paused"

  return (
    <div
      className={`pomodoro-pip ${
        variant === "fallback" ? "pomodoro-pip--fallback" : ""
      }`}
      ref={panelRef}
    >
      {variant === "fallback" ? (
        <header
          className="pomodoro-pip__titlebar"
          onPointerDown={handleTitleBarPointerDown}
          onPointerMove={handleTitleBarPointerMove}
          onPointerUp={handleTitleBarPointerUp}
        >
          <div className="pomodoro-pip__brand">
            <img alt="" className="pomodoro-pip__logo" src="/Log.png" />
            <span className="pomodoro-pip__brand-name">Whim Task</span>
          </div>

          <div className="pomodoro-pip__titlebar-actions">
            <button
              aria-label="Restore to main view"
              className="pomodoro-pip__titlebar-button"
              onClick={onRestore}
              type="button"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              aria-label="Close mini player"
              className="pomodoro-pip__titlebar-button"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>
      ) : null}

      <div className="pomodoro-pip__body">
        <div className="pomodoro-pip__content">
          <div className="pomodoro-pip__modes" role="tablist">
            {MODE_OPTIONS.map((mode) => {
              const Icon = mode.icon
              const isActive = timerMode === mode.value

              return (
                <button
                  aria-label={mode.label}
                  aria-selected={isActive}
                  className={`pomodoro-pip__mode-button ${
                    isActive ? "pomodoro-pip__mode-button--active" : ""
                  }`}
                  key={mode.value}
                  onClick={() => onModeChange(mode.value)}
                  role="tab"
                  type="button"
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>

          <div aria-live="polite" className="pomodoro-pip__timer">
            {formatTimer(secondsRemaining)}
          </div>

          <div
            aria-hidden="true"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={hasStarted ? timerProgress : 0}
            className="pomodoro-pip__divider"
            role="progressbar"
          >
            <span
              className="pomodoro-pip__divider-fill"
              style={{ width: hasStarted ? `${timerProgress}%` : "0%" }}
            />
          </div>

          <div className="pomodoro-pip__quick-add">
            {QUICK_ADD_OPTIONS.map((option) => (
              <button
                className="pomodoro-pip__quick-add-button"
                key={option.label}
                onClick={() => onQuickAdd(option.seconds)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="pomodoro-pip__controls">
            {timerPhase === "idle" ? (
              <button
                aria-label="Start timer"
                className="pomodoro-pip__control-button pomodoro-pip__control-button--primary"
                onClick={onStartPause}
                type="button"
              >
                <Play className="size-4" />
              </button>
            ) : (
              <>
                <button
                  aria-label={timerPhase === "running" ? "Pause timer" : "Resume timer"}
                  className="pomodoro-pip__control-button pomodoro-pip__control-button--primary"
                  onClick={onStartPause}
                  type="button"
                >
                  {timerPhase === "running" ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </button>
                <button
                  aria-label="Reset timer"
                  className="pomodoro-pip__control-button pomodoro-pip__control-button--secondary"
                  onClick={onReset}
                  type="button"
                >
                  <RotateCcw className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

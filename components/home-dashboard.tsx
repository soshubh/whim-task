"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { usePlanner } from "@/components/planner-provider";
import { TodayTasksPanel } from "@/components/today-tasks-panel";
import {
  formatPomodoroDuration,
  formatPomodoroSessionDuration,
  getTotalFocusSeconds,
  loadFocusSessionCount,
  loadPomodoroSessionLogs,
  type PomodoroSessionLog,
} from "@/lib/pomodoro-sessions";
import {
  buildCalendarDays,
  countRoutinesForDay,
  formatCalendarMonth,
  formatSelectedDateLabel,
  getLifetimeTaskStats,
  getPendingTasksForDay,
  isDayFullyCompleted,
  isTodayDate,
  stripTime,
  toDateKey,
  WEEK_DAY_OPTIONS,
} from "@/lib/planner";

type HomeOverviewSegment = {
  key: "focus" | "completed" | "pending";
  label: string;
  value: string;
  width: number;
};

function formatFocusTime(totalSeconds: number) {
  return formatPomodoroDuration(totalSeconds);
}

const OVERVIEW_GRADIENT = `linear-gradient(
  to right,
  var(--card) 0%,
  color-mix(in srgb, var(--primary) 28%, white) 5%,
  var(--primary) 12%,
  color-mix(in srgb, var(--primary) 84%, white) 30%,
  color-mix(in srgb, var(--primary) 56%, white) 50%,
  color-mix(in srgb, var(--primary) 28%, white) 70%,
  color-mix(in srgb, var(--primary) 8%, white) 88%,
  var(--card) 100%
)`;

type TodayProgressRingProps = {
  percent: number;
};

function TodayProgressRing({ percent }: TodayProgressRingProps) {
  const gradientId = React.useId().replace(/:/g, "");
  const size = 200;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      aria-hidden="true"
      className="home-dashboard__ring-svg"
      viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1={center - radius}
          x2={center + radius}
          y1={center}
          y2={center}
        >
          <stop className="home-dashboard__ring-stop-start" offset="0%" />
          <stop className="home-dashboard__ring-stop-end" offset="100%" />
        </linearGradient>
      </defs>
      <circle
        className="home-dashboard__ring-track"
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        strokeWidth={strokeWidth}
      />
      <circle
        className="home-dashboard__ring-progress"
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        stroke={`url(#${gradientId})`}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}

function getDayHeadingLabel(date: Date) {
  return isTodayDate(date) ? "today" : formatSelectedDateLabel(date);
}

export function HomeDashboard() {
  const { plannerState, routines } = usePlanner();
  const today = React.useMemo(() => stripTime(new Date()), []);
  const todayDateKey = toDateKey(today);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [calendarMonth, setCalendarMonth] = React.useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [focusSessions, setFocusSessions] = React.useState(0);
  const [pomodoroLogs, setPomodoroLogs] = React.useState<PomodoroSessionLog[]>(
    [],
  );
  const [hoveredOverviewKey, setHoveredOverviewKey] = React.useState<
    "focus" | "completed" | "pending" | null
  >(null);

  const selectedDateKey = toDateKey(selectedDate);
  const isSelectedToday = isTodayDate(selectedDate);
  const dayHeading = getDayHeadingLabel(selectedDate);
  const calendarDays = React.useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );

  const dayState =
    plannerState[selectedDateKey] ?? {
      tasks: [],
      completed: [],
      draft: "",
      isAdding: false,
      showCompleted: false,
    };

  const pendingTasks = React.useMemo(
    () => getPendingTasksForDay(plannerState, routines, selectedDate),
    [plannerState, routines, selectedDate, selectedDateKey],
  );

  const tasksCompleted = dayState.completed.length;
  const totalTasks = pendingTasks.length + tasksCompleted;
  const pendingTasksCount = pendingTasks.length;
  const completionPercent =
    totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

  const lifetimeStats = React.useMemo(
    () => getLifetimeTaskStats(plannerState, routines),
    [plannerState, routines],
  );

  React.useEffect(() => {
    const refreshPomodoroData = () => {
      setPomodoroLogs(loadPomodoroSessionLogs(selectedDateKey));
      setFocusSessions(loadFocusSessionCount(selectedDateKey));
    };

    refreshPomodoroData();

    const handleSessionsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ dateKey: string }>).detail;

      if (!detail || detail.dateKey === selectedDateKey) {
        refreshPomodoroData();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshPomodoroData();
      }
    };

    window.addEventListener(
      "whim-pomodoro-sessions-updated",
      handleSessionsUpdated,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(
        "whim-pomodoro-sessions-updated",
        handleSessionsUpdated,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedDateKey]);

  const pomodoroSessionCount = pomodoroLogs.length || focusSessions;
  const pomodoroTotalSeconds = getTotalFocusSeconds(
    pomodoroLogs,
    focusSessions,
  );
  const focusHours = pomodoroTotalSeconds / 3600;

  const overviewSegments = React.useMemo(() => {
    const completed = tasksCompleted;
    const pending = pendingTasksCount;
    const total = focusHours + completed + pending;
    const isEmpty = total <= 0;

    if (isEmpty) {
      return {
        gradient: OVERVIEW_GRADIENT,
        isEmpty: true,
        segments: [
          {
            key: "focus" as const,
            label: "Focus time",
            value: formatFocusTime(pomodoroTotalSeconds),
            width: 33.34,
          },
          {
            key: "completed" as const,
            label: "Completed tasks",
            value: `${completed} completed`,
            width: 33.33,
          },
          {
            key: "pending" as const,
            label: "Pending tasks",
            value: `${pending} pending`,
            width: 33.33,
          },
        ],
      };
    }

    const focusPct = (focusHours / total) * 100;
    const completedPct = (completed / total) * 100;
    const pendingPct = (pending / total) * 100;

    return {
      gradient: OVERVIEW_GRADIENT,
      isEmpty: false,
      segments: [
        {
          key: "focus" as const,
          label: "Focus time",
          value: formatFocusTime(pomodoroTotalSeconds),
          width: focusPct,
        },
        {
          key: "completed" as const,
          label: "Completed tasks",
          value: `${completed} completed`,
          width: completedPct,
        },
        {
          key: "pending" as const,
          label: "Pending tasks",
          value: `${pending} pending`,
          width: pendingPct,
        },
      ],
    };
  }, [focusHours, pendingTasksCount, pomodoroTotalSeconds, tasksCompleted]);

  const handleSelectDate = (date: Date) => {
    const nextDate = stripTime(date);
    setSelectedDate(nextDate);
    setCalendarMonth(
      new Date(nextDate.getFullYear(), nextDate.getMonth(), 1),
    );
  };

  return (
    <section className="home-dashboard" aria-label="Home dashboard">
      <div className="home-dashboard__grid">
        <article className="home-dashboard__card home-dashboard__card--hero">
          <div className="home-dashboard__card-header">
            <h2 className="home-dashboard__card-title">
              Your task overview for {dayHeading}
            </h2>
          </div>

          <div className="home-dashboard__overview-gradient">
            <div
              aria-hidden="true"
              className="home-dashboard__overview-gradient-glow"
            >
              <div
                className="home-dashboard__overview-gradient-fill"
                style={{ background: overviewSegments.gradient }}
              />
            </div>

            <div className="home-dashboard__overview-zones">
              {overviewSegments.segments
                .filter((segment) => segment.width > 0)
                .map((segment) => (
                <button
                  aria-label={`${segment.label}: ${segment.value}`}
                  className={`home-dashboard__overview-zone home-dashboard__overview-zone--${segment.key} ${
                    hoveredOverviewKey === segment.key
                      ? "home-dashboard__overview-zone--active"
                      : ""
                  }`}
                  key={segment.key}
                  onBlur={() => setHoveredOverviewKey(null)}
                  onFocus={() => setHoveredOverviewKey(segment.key)}
                  onMouseEnter={() => setHoveredOverviewKey(segment.key)}
                  onMouseLeave={() => setHoveredOverviewKey(null)}
                  style={{
                    width: `${segment.width}%`,
                    minWidth: segment.width > 0 ? "48px" : "0",
                  }}
                  type="button"
                >
                  <span
                    className={`home-dashboard__overview-tooltip ${
                      hoveredOverviewKey === segment.key
                        ? "home-dashboard__overview-tooltip--visible"
                        : ""
                    }`}
                  >
                    <strong>{segment.value}</strong>
                    <span>{segment.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </article>

        <div className="home-dashboard__sidebar">
          <article className="home-dashboard__card home-dashboard__card--calendar">
            <div className="home-dashboard__calendar-panel">
              <div className="daily-planner__calendar-header home-dashboard__calendar-header">
                <button
                  aria-label="Previous month"
                  className="daily-planner__icon-button"
                  onClick={() =>
                    setCalendarMonth(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() - 1,
                          1,
                        ),
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
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                  type="button"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div
                className="daily-planner__calendar-weekdays"
                aria-hidden="true"
              >
                {WEEK_DAY_OPTIONS.map((day) => (
                  <span
                    className="daily-planner__calendar-weekday"
                    key={day.label}
                  >
                    {day.label}
                  </span>
                ))}
              </div>

              <div className="daily-planner__calendar-grid home-dashboard__calendar-grid">
                {calendarDays.map((day) => {
                  const dayKey = toDateKey(day.date);
                  const isSelected = dayKey === selectedDateKey;
                  const isTodayDay = dayKey === todayDateKey;
                  const isCurrentMonth =
                    day.date.getMonth() === calendarMonth.getMonth();
                  const routineCount = countRoutinesForDay(routines, day.date);
                  const isCompleted = isDayFullyCompleted(
                    plannerState,
                    routines,
                    day.date,
                  );

                  return (
                    <button
                      aria-label={`Select ${day.date.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}`}
                      aria-pressed={isSelected}
                      className={[
                        "daily-planner__calendar-day",
                        "home-dashboard__calendar-day",
                        !isCurrentMonth
                          ? "daily-planner__calendar-day--muted"
                          : "",
                        isTodayDay ? "daily-planner__calendar-day--today" : "",
                        isSelected
                          ? "daily-planner__calendar-day--selected"
                          : "",
                        isCompleted
                          ? "home-dashboard__calendar-day--completed"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={dayKey}
                      onClick={() => handleSelectDate(day.date)}
                      type="button"
                    >
                      <span className="home-dashboard__calendar-day-number">
                        {day.date.getDate()}
                      </span>
                      {routineCount > 0 ? (
                        <span
                          aria-label={`${routineCount} routine${
                            routineCount === 1 ? "" : "s"
                          }`}
                          className="home-dashboard__calendar-routines"
                        >
                          {Array.from({
                            length: Math.min(routineCount, 4),
                          }).map((_, index) => (
                            <span
                              className="home-dashboard__calendar-routine-dot"
                              key={`${dayKey}-routine-${index}`}
                            />
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          <article className="home-dashboard__card home-dashboard__card--today-tasks">
            <div className="home-dashboard__card-header">
              <h2 className="home-dashboard__card-title">
                {isSelectedToday
                  ? "Today's tasks"
                  : `${formatSelectedDateLabel(selectedDate)} tasks`}
              </h2>
            </div>

            <TodayTasksPanel
              date={selectedDate}
              embedded
              key={selectedDateKey}
              showHeader={false}
            />
          </article>
        </div>

        <div className="home-dashboard__today-row">
          <article className="home-dashboard__card home-dashboard__card--today-status">
            <div className="home-dashboard__card-header">
              <h2 className="home-dashboard__card-title">
                {isSelectedToday
                  ? "Today's task status"
                  : `${formatSelectedDateLabel(selectedDate)} task status`}
              </h2>
            </div>

            <div className="home-dashboard__today-status-body">
              <div
                aria-label={`${completionPercent}% of tasks completed`}
                className="home-dashboard__ring-shell"
              >
                <TodayProgressRing percent={completionPercent} />
                <div className="home-dashboard__ring-center">
                  <span className="home-dashboard__ring-percent">
                    {completionPercent}%
                  </span>
                  <span className="home-dashboard__ring-copy">Goal</span>
                </div>
              </div>

              <p className="home-dashboard__today-footnote">
                <strong>
                  {tasksCompleted} / {totalTasks}
                </strong>{" "}
                tasks completed · {pendingTasksCount} left
              </p>
            </div>
          </article>

          <article className="home-dashboard__card home-dashboard__card--today-pomodoros">
            <div className="home-dashboard__card-header">
              <h2 className="home-dashboard__card-title">
                {isSelectedToday
                  ? "Today's Pomodoros"
                  : `${formatSelectedDateLabel(selectedDate)} Pomodoros`}
              </h2>
            </div>

            <div
              className={`home-dashboard__pomodoro-panel ${
                pomodoroLogs.length > 0
                  ? "home-dashboard__pomodoro-panel--filled"
                  : "home-dashboard__pomodoro-panel--empty"
              }`}
            >
              {pomodoroLogs.length > 0 ? (
                <ul className="home-dashboard__pomodoro-list">
                  {pomodoroLogs.map((session) => (
                    <li
                      className="home-dashboard__pomodoro-item"
                      key={session.id}
                    >
                      <span className="home-dashboard__pomodoro-task">
                        {session.taskTitle}
                      </span>
                      <span className="home-dashboard__pomodoro-duration">
                        {formatPomodoroSessionDuration(session.durationSeconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="home-dashboard__pomodoro-summary">
                <strong>
                  {pomodoroSessionCount} session
                  {pomodoroSessionCount === 1 ? "" : "s"}
                </strong>
                <span>
                  {formatPomodoroDuration(pomodoroTotalSeconds)} total
                </span>
              </p>
            </div>
          </article>
        </div>

        <article className="home-dashboard__card home-dashboard__card--progress">
          <div className="home-dashboard__card-header">
            <h2 className="home-dashboard__card-title">Overall progress</h2>

            <p className="home-dashboard__progress-value">
              {lifetimeStats.percent}%
            </p>
          </div>

          <div className="home-dashboard__progress-bar">
            <span
              className="home-dashboard__progress-fill"
              style={{ width: `${lifetimeStats.percent}%` }}
            />
          </div>

          <div className="home-dashboard__progress-footer">
            <span>{lifetimeStats.totalCompleted} tasks completed</span>
            <span>{lifetimeStats.totalCreated} tasks created</span>
          </div>
        </article>
      </div>
    </section>
  );
}

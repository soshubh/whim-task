"use client"

import { CalendarDays, Check } from "lucide-react"

import type { GoogleCalendarMeeting } from "@/lib/google-calendar"
import { formatGoogleMeetingTimeLabel } from "@/lib/google-calendar"

type GoogleMeetingRowProps = {
  meeting: GoogleCalendarMeeting
  onComplete: () => void
}

export function GoogleMeetingRow({ meeting, onComplete }: GoogleMeetingRowProps) {
  const content = (
    <>
      <span className="daily-planner__meeting-icon" aria-hidden>
        <CalendarDays className="size-4" />
      </span>
      <span className="daily-planner__meeting-copy">
        <span className="daily-planner__meeting-time">
          {formatGoogleMeetingTimeLabel(meeting)}
        </span>
        <span className="daily-planner__meeting-title">{meeting.title}</span>
      </span>
      <span className="daily-planner__meeting-badge">Meeting</span>
    </>
  )

  return (
    <div className="daily-planner__meeting-row">
      <button
        aria-label={`Mark ${meeting.title} complete`}
        className="daily-planner__checkbox"
        onClick={onComplete}
        type="button"
      >
        <Check className="size-3.5" />
      </button>

      {meeting.htmlLink ? (
        <a
          className="daily-planner__meeting-main"
          href={meeting.htmlLink}
          rel="noreferrer"
          target="_blank"
        >
          {content}
        </a>
      ) : (
        <div className="daily-planner__meeting-main">{content}</div>
      )}
    </div>
  )
}

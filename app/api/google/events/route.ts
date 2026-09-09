import { NextResponse } from "next/server"

import { fetchGoogleCalendarMeetings } from "@/lib/google-calendar-events"

function isDateKey(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function toInclusiveDayBounds(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00`)
  const end = new Date(`${endDateKey}T00:00:00`)
  end.setDate(end.getDate() + 1)

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const start = url.searchParams.get("start")
  const end = url.searchParams.get("end")

  if (!isDateKey(start) || !isDateKey(end)) {
    return NextResponse.json(
      { error: "start and end must be YYYY-MM-DD" },
      { status: 400 },
    )
  }

  if (start > end) {
    return NextResponse.json(
      { error: "start must be on or before end" },
      { status: 400 },
    )
  }

  try {
    const bounds = toInclusiveDayBounds(start, end)
    const result = await fetchGoogleCalendarMeetings(bounds)

    return NextResponse.json({
      connected: result.connected,
      meetings: result.meetings,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Google Calendar meetings",
      },
      { status: 500 },
    )
  }
}

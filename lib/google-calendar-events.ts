import { getValidGoogleAccessToken } from "@/lib/google-oauth"

export type GoogleCalendarMeeting = {
  allDay: boolean
  dateKey: string
  end: string | null
  htmlLink: string | null
  id: string
  start: string | null
  startLabel: string
  title: string
}

type GoogleCalendarEventResource = {
  id?: string
  summary?: string
  htmlLink?: string
  start?: {
    date?: string
    dateTime?: string
    timeZone?: string
  }
  end?: {
    date?: string
    dateTime?: string
    timeZone?: string
  }
  status?: string
}

function toDateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${`${month}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`
}

function getDateKeyFromGoogleStart(start?: {
  date?: string
  dateTime?: string
}) {
  if (start?.date) {
    return start.date
  }

  if (start?.dateTime) {
    const date = new Date(start.dateTime)
    return toDateKeyFromParts(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    )
  }

  return null
}

function formatMeetingStartLabel(options: {
  allDay: boolean
  dateTime?: string
}) {
  if (options.allDay) {
    return "All day"
  }

  if (!options.dateTime) {
    return "Meeting"
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(options.dateTime))
}

export function mapGoogleCalendarEvents(
  items: GoogleCalendarEventResource[],
): GoogleCalendarMeeting[] {
  const meetings: GoogleCalendarMeeting[] = []

  for (const item of items) {
    if (!item.id || item.status === "cancelled") {
      continue
    }

    const allDay = Boolean(item.start?.date && !item.start?.dateTime)
    const dateKey = getDateKeyFromGoogleStart(item.start)
    if (!dateKey) {
      continue
    }

    meetings.push({
      id: item.id,
      title: item.summary?.trim() || "Untitled meeting",
      dateKey,
      allDay,
      start: item.start?.dateTime ?? item.start?.date ?? null,
      end: item.end?.dateTime ?? item.end?.date ?? null,
      htmlLink: item.htmlLink ?? null,
      startLabel: formatMeetingStartLabel({
        allDay,
        dateTime: item.start?.dateTime,
      }),
    })
  }

  return meetings.sort((left, right) => {
    if (left.dateKey !== right.dateKey) {
      return left.dateKey.localeCompare(right.dateKey)
    }

    if (left.allDay !== right.allDay) {
      return left.allDay ? -1 : 1
    }

    return (left.start ?? "").localeCompare(right.start ?? "")
  })
}

export async function fetchGoogleCalendarMeetings(options: {
  timeMin: string
  timeMax: string
}) {
  const accessToken = await getValidGoogleAccessToken()
  if (!accessToken) {
    return { connected: false as const, meetings: [] as GoogleCalendarMeeting[] }
  }

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: options.timeMin,
    timeMax: options.timeMax,
    maxResults: "250",
  })

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  )

  if (response.status === 401) {
    return { connected: false as const, meetings: [] as GoogleCalendarMeeting[] }
  }

  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || "Failed to fetch Google Calendar events")
  }

  const payload = (await response.json()) as {
    items?: GoogleCalendarEventResource[]
  }

  return {
    connected: true as const,
    meetings: mapGoogleCalendarEvents(payload.items ?? []),
  }
}

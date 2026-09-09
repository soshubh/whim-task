export type GoogleCalendarConnection = {
  connected: boolean
  connectedAt: string | null
  email: string | null
}

export const GOOGLE_CALENDAR_STORAGE_KEY = "whim-google-calendar"
export const GOOGLE_CALENDAR_UPDATED_EVENT = "whim-google-calendar-updated"

export const DEFAULT_GOOGLE_CALENDAR_CONNECTION: GoogleCalendarConnection = {
  connected: false,
  email: null,
  connectedAt: null,
}

function normalizeConnection(
  parsed: Partial<GoogleCalendarConnection> | null | undefined,
): GoogleCalendarConnection {
  if (!parsed) {
    return DEFAULT_GOOGLE_CALENDAR_CONNECTION
  }

  return {
    connected: Boolean(parsed.connected),
    email: parsed.email ?? null,
    connectedAt: parsed.connectedAt ?? null,
  }
}

export function loadGoogleCalendarConnection(): GoogleCalendarConnection {
  if (typeof window === "undefined") {
    return DEFAULT_GOOGLE_CALENDAR_CONNECTION
  }

  try {
    const raw = window.localStorage.getItem(GOOGLE_CALENDAR_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_GOOGLE_CALENDAR_CONNECTION
    }

    return normalizeConnection(
      JSON.parse(raw) as Partial<GoogleCalendarConnection>,
    )
  } catch {
    return DEFAULT_GOOGLE_CALENDAR_CONNECTION
  }
}

export function saveGoogleCalendarConnection(
  connection: GoogleCalendarConnection,
) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    GOOGLE_CALENDAR_STORAGE_KEY,
    JSON.stringify(connection),
  )
  window.dispatchEvent(new CustomEvent(GOOGLE_CALENDAR_UPDATED_EVENT))
}

export function markGoogleCalendarConnected(
  email: string | null,
): GoogleCalendarConnection {
  const connection: GoogleCalendarConnection = {
    connected: true,
    email: email?.trim() || null,
    connectedAt: new Date().toISOString(),
  }

  saveGoogleCalendarConnection(connection)
  return connection
}

export function markGoogleCalendarDisconnected(): GoogleCalendarConnection {
  saveGoogleCalendarConnection(DEFAULT_GOOGLE_CALENDAR_CONNECTION)
  return DEFAULT_GOOGLE_CALENDAR_CONNECTION
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID !== "your-google-client-id",
  )
}

export function startGoogleCalendarConnect() {
  window.location.assign("/api/google/connect")
}

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarConnection> {
  try {
    const response = await fetch("/api/google/status", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })

    if (!response.ok) {
      return loadGoogleCalendarConnection()
    }

    const data = (await response.json()) as {
      connected?: boolean
      email?: string | null
    }

    if (data.connected) {
      return markGoogleCalendarConnected(data.email ?? null)
    }

    return markGoogleCalendarDisconnected()
  } catch {
    return loadGoogleCalendarConnection()
  }
}

export async function disconnectGoogleCalendarRemote(): Promise<GoogleCalendarConnection> {
  try {
    await fetch("/api/google/disconnect", {
      method: "POST",
      credentials: "same-origin",
    })
  } catch {
    // Still clear local UI state if the request fails.
  }

  return markGoogleCalendarDisconnected()
}

export function consumeGoogleCalendarCallbackParams() {
  if (typeof window === "undefined") {
    return null
  }

  const url = new URL(window.location.href)
  const status = url.searchParams.get("google_calendar")
  if (!status) {
    return null
  }

  const message = url.searchParams.get("google_calendar_message")
  url.searchParams.delete("google_calendar")
  url.searchParams.delete("google_calendar_message")

  const next =
    url.searchParams.toString().length > 0
      ? `${url.pathname}?${url.searchParams.toString()}${url.hash}`
      : `${url.pathname}${url.hash}`

  window.history.replaceState({}, "", next)

  return {
    status: status as "connected" | "error" | string,
    message,
  }
}

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

export function toGoogleMeetingTaskId(meetingId: string) {
  return `gcal-${meetingId}`
}

export function isGoogleMeetingTaskId(taskId: string) {
  return taskId.startsWith("gcal-")
}

export function getGoogleMeetingDateKey(meeting: GoogleCalendarMeeting) {
  if (meeting.allDay && meeting.start) {
    return meeting.start.slice(0, 10)
  }

  if (meeting.start) {
    const date = new Date(meeting.start)
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = `${date.getMonth() + 1}`.padStart(2, "0")
      const day = `${date.getDate()}`.padStart(2, "0")
      return `${year}-${month}-${day}`
    }
  }

  return meeting.dateKey
}

export function formatGoogleMeetingTimeLabel(meeting: GoogleCalendarMeeting) {
  if (meeting.allDay) {
    return "All day"
  }

  if (!meeting.start) {
    return meeting.startLabel || "Meeting"
  }

  const date = new Date(meeting.start)
  if (Number.isNaN(date.getTime())) {
    return meeting.startLabel || "Meeting"
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export async function fetchGoogleCalendarMeetingsForRange(
  startDateKey: string,
  endDateKey: string,
): Promise<{
  connected: boolean
  meetings: GoogleCalendarMeeting[]
}> {
  const params = new URLSearchParams({
    start: startDateKey,
    end: endDateKey,
  })

  const response = await fetch(`/api/google/events?${params.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  })

  if (!response.ok) {
    return { connected: false, meetings: [] }
  }

  const data = (await response.json()) as {
    connected?: boolean
    meetings?: GoogleCalendarMeeting[]
  }

  return {
    connected: Boolean(data.connected),
    meetings: data.meetings ?? [],
  }
}

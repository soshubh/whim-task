import { cookies } from "next/headers"

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ")

export const GOOGLE_OAUTH_STATE_COOKIE = "whim_google_oauth_state"
export const GOOGLE_ACCESS_TOKEN_COOKIE = "whim_google_access_token"
export const GOOGLE_REFRESH_TOKEN_COOKIE = "whim_google_refresh_token"
export const GOOGLE_TOKEN_EXPIRY_COOKIE = "whim_google_token_expiry"
export const GOOGLE_EMAIL_COOKIE = "whim_google_email"

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  id_token?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  email?: string
  name?: string
  picture?: string
}

export function getGoogleClientConfig() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

  if (
    !clientId ||
    clientId === "your-google-client-id" ||
    !clientSecret ||
    clientSecret === "your-google-client-secret"
  ) {
    return null
  }

  return { clientId, clientSecret }
}

export function getAppBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, "")
  }

  return new URL(request.url).origin
}

export function getGoogleRedirectUri(request: Request) {
  return `${getAppBaseUrl(request)}/api/google/callback`
}

export function buildGoogleAuthUrl(request: Request, state: string) {
  const config = getGoogleClientConfig()
  if (!config) {
    throw new Error("Google OAuth is not configured")
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getGoogleRedirectUri(request),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(
  request: Request,
  code: string,
): Promise<GoogleTokenResponse> {
  const config = getGoogleClientConfig()
  if (!config) {
    throw new Error("Google OAuth is not configured")
  }

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: getGoogleRedirectUri(request),
    grant_type: "authorization_code",
  })

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  return (await response.json()) as GoogleTokenResponse
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const config = getGoogleClientConfig()
  if (!config) {
    throw new Error("Google OAuth is not configured")
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })

  return (await response.json()) as GoogleTokenResponse
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    return {}
  }

  return (await response.json()) as GoogleUserInfo
}

function cookieBaseOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

export async function setGoogleOAuthStateCookie(state: string) {
  const cookieStore = await cookies()
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieBaseOptions(60 * 10))
}

export async function clearGoogleOAuthStateCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE)
}

export async function saveGoogleTokens(options: {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number
  email?: string | null
}) {
  const cookieStore = await cookies()
  const accessMaxAge = options.expiresIn ?? 60 * 60
  const longMaxAge = 60 * 60 * 24 * 180
  const expiry = Date.now() + accessMaxAge * 1000

  cookieStore.set(
    GOOGLE_ACCESS_TOKEN_COOKIE,
    options.accessToken,
    cookieBaseOptions(accessMaxAge),
  )
  cookieStore.set(
    GOOGLE_TOKEN_EXPIRY_COOKIE,
    String(expiry),
    cookieBaseOptions(longMaxAge),
  )

  if (options.refreshToken) {
    cookieStore.set(
      GOOGLE_REFRESH_TOKEN_COOKIE,
      options.refreshToken,
      cookieBaseOptions(longMaxAge),
    )
  }

  if (options.email) {
    cookieStore.set(
      GOOGLE_EMAIL_COOKIE,
      options.email,
      cookieBaseOptions(longMaxAge),
    )
  }
}

export async function clearGoogleTokens() {
  const cookieStore = await cookies()
  cookieStore.delete(GOOGLE_ACCESS_TOKEN_COOKIE)
  cookieStore.delete(GOOGLE_REFRESH_TOKEN_COOKIE)
  cookieStore.delete(GOOGLE_TOKEN_EXPIRY_COOKIE)
  cookieStore.delete(GOOGLE_EMAIL_COOKIE)
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE)
}

export async function getGoogleConnectionFromCookies() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(GOOGLE_ACCESS_TOKEN_COOKIE)?.value ?? null
  const refreshToken =
    cookieStore.get(GOOGLE_REFRESH_TOKEN_COOKIE)?.value ?? null
  const email = cookieStore.get(GOOGLE_EMAIL_COOKIE)?.value ?? null
  const expiryRaw = cookieStore.get(GOOGLE_TOKEN_EXPIRY_COOKIE)?.value ?? null
  const expiry = expiryRaw ? Number(expiryRaw) : null

  return {
    connected: Boolean(accessToken || refreshToken),
    accessToken,
    refreshToken,
    email,
    expiry,
  }
}

export async function getValidGoogleAccessToken() {
  const connection = await getGoogleConnectionFromCookies()

  if (connection.accessToken && connection.expiry && connection.expiry > Date.now() + 60_000) {
    return connection.accessToken
  }

  if (!connection.refreshToken) {
    return connection.accessToken
  }

  const refreshed = await refreshGoogleAccessToken(connection.refreshToken)
  if (!refreshed.access_token) {
    return null
  }

  await saveGoogleTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? connection.refreshToken,
    expiresIn: refreshed.expires_in,
    email: connection.email,
  })

  return refreshed.access_token
}

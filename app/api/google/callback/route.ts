import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  clearGoogleOAuthStateCookie,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getAppBaseUrl,
  GOOGLE_OAUTH_STATE_COOKIE,
  saveGoogleTokens,
} from "@/lib/google-oauth"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const oauthError = url.searchParams.get("error")
  const appBaseUrl = getAppBaseUrl(request)

  const redirectWithStatus = (status: "connected" | "error", message?: string) => {
    const redirectUrl = new URL(appBaseUrl)
    redirectUrl.searchParams.set("google_calendar", status)
    if (message) {
      redirectUrl.searchParams.set("google_calendar_message", message)
    }
    return NextResponse.redirect(redirectUrl)
  }

  if (oauthError) {
    await clearGoogleOAuthStateCookie()
    return redirectWithStatus("error", oauthError)
  }

  if (!code || !state) {
    return redirectWithStatus("error", "missing_code")
  }

  const cookieStore = await cookies()
  const savedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value
  await clearGoogleOAuthStateCookie()

  if (!savedState || savedState !== state) {
    return redirectWithStatus("error", "invalid_state")
  }

  try {
    const tokens = await exchangeGoogleCode(request, code)

    if (!tokens.access_token) {
      return redirectWithStatus(
        "error",
        tokens.error_description || tokens.error || "token_exchange_failed",
      )
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token)

    await saveGoogleTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      email: userInfo.email ?? null,
    })

    return redirectWithStatus("connected")
  } catch {
    return redirectWithStatus("error", "callback_failed")
  }
}

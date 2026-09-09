import { NextResponse } from "next/server"

import {
  buildGoogleAuthUrl,
  getGoogleClientConfig,
  setGoogleOAuthStateCookie,
} from "@/lib/google-oauth"

export async function GET(request: Request) {
  if (!getGoogleClientConfig()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured" },
      { status: 500 },
    )
  }

  const state = crypto.randomUUID()
  await setGoogleOAuthStateCookie(state)

  const authUrl = buildGoogleAuthUrl(request, state)
  return NextResponse.redirect(authUrl)
}

import { NextResponse } from "next/server"

import { getGoogleConnectionFromCookies } from "@/lib/google-oauth"

export async function GET() {
  const connection = await getGoogleConnectionFromCookies()

  return NextResponse.json({
    connected: connection.connected,
    email: connection.email,
  })
}

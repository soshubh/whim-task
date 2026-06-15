import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "")
}

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  const normalizedUrl = normalizeSupabaseUrl(url)

  if (!browserClient) {
    browserClient = createClient(normalizedUrl, anonKey)
  }

  return browserClient
}

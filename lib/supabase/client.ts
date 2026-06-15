import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let browserClient: SupabaseClient | null = null

function normalizeSupabaseUrl(url: string) {
  return url
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "")
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  return {
    url: normalizeSupabaseUrl(url),
    anonKey,
  }
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null
}

export function getSupabaseClient() {
  const config = getSupabaseConfig()

  if (!config) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    )
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey)
  }

  return browserClient
}

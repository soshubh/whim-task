type AuthLikeError = {
  code?: string
  message?: string
  status?: number
}

export function formatAuthError(error: unknown, fallback: string) {
  if (!error) {
    return fallback
  }

  if (typeof error === "string") {
    const trimmed = error.trim()
    return trimmed && trimmed !== "{}" ? trimmed : fallback
  }

  const authError = error as AuthLikeError
  const message =
    typeof authError.message === "string" ? authError.message.trim() : ""

  if (message && message !== "{}") {
    return message
  }

  if (authError.status === 500 || authError.code === "unexpected_failure") {
    return "Email is accepted, but the one-time code could not be sent. Check Supabase SMTP/Brevo settings."
  }

  if (authError.status === 429) {
    return "Too many attempts. Wait a minute and try again."
  }

  return fallback
}

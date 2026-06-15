export type AuthUser = {
  email: string
  name: string
  userId: string
}

export type AuthSession = AuthUser & {
  signedInAt: string
}

export const AUTH_UPDATED_EVENT = "whim-auth-updated"

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

const GMAIL_ADDRESS_PATTERN = /^[^\s@]+@(gmail|googlemail)\.com$/

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

export function isGmailAddress(email: string) {
  return GMAIL_ADDRESS_PATTERN.test(normalizeEmail(email))
}

export function deriveNameFromEmail(email: string) {
  const localPart = normalizeEmail(email).split("@")[0] ?? ""

  return localPart
    .replace(/[._+-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function createAuthSession(input: {
  email: string
  name?: string | null
  userId: string
}): AuthSession {
  return {
    userId: input.userId,
    email: normalizeEmail(input.email),
    name: input.name?.trim() || deriveNameFromEmail(input.email),
    signedInAt: new Date().toISOString(),
  }
}

const ACTIVE_USER_ID_KEY = "whim-task-active-user-id"
const LEGACY_PREFIX = "whim-task-"
const USER_PREFIX = "whim-task:user:"

let activeUserId: string | null = null

export function setActiveUserId(userId: string | null) {
  activeUserId = userId

  if (typeof window === "undefined") {
    return
  }

  if (userId) {
    window.localStorage.setItem(ACTIVE_USER_ID_KEY, userId)
  } else {
    window.localStorage.removeItem(ACTIVE_USER_ID_KEY)
  }
}

export function getActiveUserId() {
  if (activeUserId) {
    return activeUserId
  }

  if (typeof window === "undefined") {
    return null
  }

  return window.localStorage.getItem(ACTIVE_USER_ID_KEY)
}

export function getScopedStorageKey(baseKey: string, userId = getActiveUserId()) {
  if (!userId) {
    return baseKey
  }

  return `${USER_PREFIX}${userId}:${baseKey}`
}

function getLegacySettingsEmail() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const stored = window.localStorage.getItem(`${LEGACY_PREFIX}settings`)
    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as { profile?: { email?: string } }
    return typeof parsed.profile?.email === "string"
      ? parsed.profile.email.trim().toLowerCase()
      : null
  } catch {
    return null
  }
}

function shouldMigrateLegacyStorage(userEmail: string) {
  const legacyEmail = getLegacySettingsEmail()

  if (legacyEmail) {
    return legacyEmail === userEmail.trim().toLowerCase()
  }

  return false
}

function listLegacyStorageKeys() {
  if (typeof window === "undefined") {
    return []
  }

  const keys: string[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith(LEGACY_PREFIX) || key.startsWith(USER_PREFIX)) {
      continue
    }

    if (key === ACTIVE_USER_ID_KEY) {
      continue
    }

    keys.push(key)
  }

  return keys
}

export function migrateLegacyStorageForUser(userId: string, userEmail: string) {
  if (typeof window === "undefined" || !shouldMigrateLegacyStorage(userEmail)) {
    return
  }

  const scopedPlannerKey = getScopedStorageKey(
    `${LEGACY_PREFIX}planner-state`,
    userId,
  )

  if (window.localStorage.getItem(scopedPlannerKey)) {
    return
  }

  for (const legacyKey of listLegacyStorageKeys()) {
    const scopedKey = getScopedStorageKey(legacyKey, userId)
    const legacyValue = window.localStorage.getItem(legacyKey)

    if (!legacyValue || window.localStorage.getItem(scopedKey)) {
      continue
    }

    window.localStorage.setItem(scopedKey, legacyValue)
    window.localStorage.removeItem(legacyKey)
  }
}

export function readScopedItem(baseKey: string) {
  if (typeof window === "undefined") {
    return null
  }

  const userId = getActiveUserId()
  if (!userId) {
    return window.localStorage.getItem(baseKey)
  }

  return window.localStorage.getItem(getScopedStorageKey(baseKey, userId))
}

export function writeScopedItem(baseKey: string, value: string) {
  if (typeof window === "undefined") {
    return
  }

  const userId = getActiveUserId()
  if (!userId) {
    return
  }

  window.localStorage.setItem(getScopedStorageKey(baseKey, userId), value)
}

export function readScopedJson<T>(baseKey: string, fallback: T): T {
  const stored = readScopedItem(baseKey)
  if (!stored) {
    return fallback
  }

  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

export function writeScopedJson(baseKey: string, value: unknown) {
  writeScopedItem(baseKey, JSON.stringify(value))
}

export function removeScopedItem(baseKey: string) {
  if (typeof window === "undefined") {
    return
  }

  const userId = getActiveUserId()
  if (!userId) {
    return
  }

  window.localStorage.removeItem(getScopedStorageKey(baseKey, userId))
}

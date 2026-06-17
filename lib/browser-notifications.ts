import type { NotificationSound } from "@/lib/settings"

export type BrowserNotificationPermission =
  | "default"
  | "denied"
  | "granted"
  | "unsupported"

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

export function getNotificationPermissionHint(
  permission: BrowserNotificationPermission,
) {
  if (permission === "unsupported") {
    return "This browser does not support notifications."
  }

  if (permission === "denied") {
    return "Notifications are blocked. Open your browser or device settings and allow notifications for this site."
  }

  return null
}

export function canRequestBrowserNotificationPermission(
  permission: BrowserNotificationPermission,
) {
  return permission === "default"
}

export async function resolveBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  return getBrowserNotificationPermission()
}

export function watchBrowserNotificationPermission(
  onChange: (permission: BrowserNotificationPermission) => void,
) {
  if (typeof window === "undefined" || !("permissions" in navigator)) {
    return () => undefined
  }

  let permissionStatus: PermissionStatus | null = null

  void navigator.permissions
    .query({ name: "notifications" })
    .then((status) => {
      permissionStatus = status
      onChange(getBrowserNotificationPermission())

      status.onchange = () => {
        onChange(getBrowserNotificationPermission())
      }
    })
    .catch(() => undefined)

  return () => {
    if (permissionStatus) {
      permissionStatus.onchange = null
    }
  }
}

export async function promptBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const
  }

  if (Notification.permission === "granted") {
    return "granted"
  }

  try {
    return await Notification.requestPermission()
  } catch {
    return getBrowserNotificationPermission()
  }
}

export async function requestBrowserNotificationPermission() {
  return promptBrowserNotificationPermission()
}

export function showBrowserNotification(input: {
  body: string
  sound?: NotificationSound
  title: string
}) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false
  }

  if (Notification.permission !== "granted") {
    return false
  }

  const notification = new Notification(input.title, {
    body: input.body,
    icon: "/Log.png",
  })

  if (input.sound && input.sound !== "none") {
    playNotificationSound(input.sound)
  }

  notification.onclick = () => {
    window.focus()
    notification.close()
  }

  return true
}

export function playNotificationSound(sound: NotificationSound) {
  if (typeof window === "undefined" || sound === "none") {
    return
  }

  const context = new AudioContext()
  const masterGain = context.createGain()

  const tone =
    sound === "bell"
      ? { frequencies: [880, 1046, 784], type: "triangle" as OscillatorType, volume: 0.07 }
      : sound === "soft"
        ? { frequencies: [520, 660, 780], type: "sine" as OscillatorType, volume: 0.04 }
        : { frequencies: [660, 830, 660], type: "sine" as OscillatorType, volume: 0.06 }

  masterGain.gain.value = 0.0001
  masterGain.connect(context.destination)

  const now = context.currentTime
  const duration = 5
  const pulseEvery = 0.36
  const pulseLength = 0.28

  if (context.state === "suspended") {
    void context.resume()
  }

  for (let time = 0; time < duration; time += pulseEvery) {
    const frequency = tone.frequencies[Math.round(time / pulseEvery) % tone.frequencies.length]
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = now + time
    const end = Math.min(start + pulseLength, now + duration)

    oscillator.type = tone.type
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain)
    gain.connect(masterGain)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
  }

  masterGain.gain.setValueAtTime(1, now)
  masterGain.gain.setValueAtTime(1, now + duration - 0.25)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  window.setTimeout(() => {
    void context.close()
  }, duration * 1000 + 250)
}

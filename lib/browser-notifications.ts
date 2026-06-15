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

export async function requestBrowserNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const
  }

  if (Notification.permission === "granted") {
    return "granted" as const
  }

  if (Notification.permission === "denied") {
    return "denied" as const
  }

  const permission = await Notification.requestPermission()
  return permission
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
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  const tone =
    sound === "bell"
      ? { frequency: 880, type: "triangle" as OscillatorType }
      : sound === "soft"
        ? { frequency: 520, type: "sine" as OscillatorType }
        : { frequency: 660, type: "sine" as OscillatorType }

  oscillator.type = tone.type
  oscillator.frequency.value = tone.frequency
  gain.gain.value = sound === "soft" ? 0.04 : 0.07

  oscillator.connect(gain)
  gain.connect(context.destination)

  const now = context.currentTime
  oscillator.start(now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
  oscillator.stop(now + 0.36)

  window.setTimeout(() => {
    void context.close()
  }, 500)
}

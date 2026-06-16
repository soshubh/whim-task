"use client"

import { LogOut } from "lucide-react"

import { SettingsPanel } from "@/components/settings-panel"
import { useSettings } from "@/components/settings-provider"

export function SettingsLayer({ onLogout }: { onLogout?: () => void }) {
  const { closeSettings, settingsOpen } = useSettings()

  return (
    <SettingsPanel
      onClose={closeSettings}
      onLogout={onLogout}
      open={settingsOpen}
    />
  )
}

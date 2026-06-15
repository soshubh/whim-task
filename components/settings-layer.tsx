"use client"

import { SettingsPanel } from "@/components/settings-panel"
import { useSettings } from "@/components/settings-provider"

export function SettingsLayer() {
  const { closeSettings, settingsOpen } = useSettings()

  return <SettingsPanel onClose={closeSettings} open={settingsOpen} />
}

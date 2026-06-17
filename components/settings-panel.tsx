"use client"

import * as React from "react"
import { Camera, Check, Volume2 } from "lucide-react"

import { ContentDrawer } from "@/components/content-drawer"
import { useSettings } from "@/components/settings-provider"
import {
  getBrowserNotificationPermission,
  playNotificationSound,
  promptBrowserNotificationPermission,
} from "@/lib/browser-notifications"
import { APP_NAME, APP_VERSION } from "@/lib/app-meta"
import {
  areSettingsEqual,
  type AppSettings,
  type DailyUpdateSettings,
  type NotificationSettings,
  type NotificationSound,
  type UserProfile,
} from "@/lib/settings"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"

const SOUND_OPTIONS: Array<{ label: string; value: NotificationSound }> = [
  { label: "Default", value: "default" },
  { label: "Soft chime", value: "soft" },
  { label: "Bell", value: "bell" },
  { label: "Silent", value: "none" },
]

type SettingsPanelProps = {
  onClose: () => void
  onLogout?: () => void
  open: boolean
}

export function SettingsPanel({ onClose, onLogout, open }: SettingsPanelProps) {
  const {
    browserPermission,
    commitSettings,
    refreshBrowserPermission,
    settings,
  } = useSettings()

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const pendingAvatarFileRef = React.useRef<File | null>(null)
  const [draft, setDraft] = React.useState<AppSettings>(settings)
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const [notificationHint, setNotificationHint] = React.useState<string | null>(
    null,
  )
  const [isCheckingPermission, setIsCheckingPermission] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setDraft(settings)
      pendingAvatarFileRef.current = null
      setSaveError(null)
      setNotificationHint(null)
    }
  }, [open, settings])

  const hasChanges = !areSettingsEqual(draft, settings)
  const profile = draft.profile
  const notifications = draft.notifications
  const dailyUpdate = notifications.dailyUpdate

  const profileInitial = (
    profile.name.trim()[0] ||
    profile.email.trim()[0] ||
    "U"
  ).toUpperCase()

  const updateDraftProfile = (values: Partial<UserProfile>) => {
    setDraft((current) => ({
      ...current,
      profile: {
        ...current.profile,
        ...values,
        email: current.profile.email,
      },
    }))
  }

  const updateDraftNotifications = (values: Partial<NotificationSettings>) => {
    setDraft((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        ...values,
        dailyUpdate: values.dailyUpdate
          ? { ...current.notifications.dailyUpdate, ...values.dailyUpdate }
          : current.notifications.dailyUpdate,
      },
    }))
  }

  const updateDraftDailyUpdate = (values: Partial<DailyUpdateSettings>) => {
    setDraft((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        dailyUpdate: {
          ...current.notifications.dailyUpdate,
          ...values,
        },
      },
    }))
  }

  const disableDailyUpdateNotifications = () => {
    updateDraftDailyUpdate({ enabled: false })
    updateDraftNotifications({ browserNotificationsEnabled: false })
  }

  const readBrowserPermission = React.useCallback(() => {
    refreshBrowserPermission()
    return getBrowserNotificationPermission()
  }, [refreshBrowserPermission])

  const syncBrowserNotificationsEnabled = (
    permission: ReturnType<typeof getBrowserNotificationPermission>,
  ) => {
    updateDraftNotifications({
      browserNotificationsEnabled: permission === "granted",
    })
  }

  const handleDailyUpdateToggle = (checked: boolean) => {
    setNotificationHint(null)

    if (!checked) {
      disableDailyUpdateNotifications()
      return
    }

    updateDraftDailyUpdate({ enabled: true })

    const permission = readBrowserPermission()
    syncBrowserNotificationsEnabled(permission)

    if (permission === "unsupported") {
      setNotificationHint(
        "Daily updates are on in the app. This browser does not support push notifications.",
      )
    }
  }

  const handleAllowBrowserNotifications = async () => {
    setIsCheckingPermission(true)
    setNotificationHint(null)

    try {
      const permissionBefore = getBrowserNotificationPermission()

      if (permissionBefore === "unsupported") {
        setNotificationHint("This browser does not support notifications.")
        return
      }

      if (permissionBefore === "granted") {
        updateDraftNotifications({ browserNotificationsEnabled: true })
        refreshBrowserPermission()
        return
      }

      const permission = await promptBrowserNotificationPermission()
      refreshBrowserPermission()

      if (permission === "granted") {
        updateDraftNotifications({ browserNotificationsEnabled: true })
        setNotificationHint(null)
        return
      }

      if (permission === "denied" && permissionBefore === "denied") {
        setNotificationHint(
          "Notifications are blocked in your browser. Open site settings, allow notifications for this site, then tap Allow notifications again.",
        )
        return
      }

      setNotificationHint(
        "Notifications were not allowed. Tap Allow notifications to try again.",
      )
    } catch {
      setNotificationHint("Could not enable browser notifications.")
    } finally {
      setIsCheckingPermission(false)
    }
  }

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setSaveError("Profile picture must be 5 MB or smaller.")
      event.target.value = ""
      return
    }

    pendingAvatarFileRef.current = file
    setSaveError(null)

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateDraftProfile({ avatar: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaveError(null)
    setIsSaving(true)

    try {
      const permission = readBrowserPermission()
      const nextDraft: AppSettings = {
        ...draft,
        notifications: {
          ...draft.notifications,
          browserNotificationsEnabled:
            draft.notifications.dailyUpdate.enabled && permission === "granted",
        },
      }

      await commitSettings(nextDraft, {
        avatarFile: pendingAvatarFileRef.current,
      })
      pendingAvatarFileRef.current = null
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save settings. Try again.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ContentDrawer
      actionBar={
        <>
          {saveError ? (
            <p className="content-drawer__settings-hint" role="alert">
              {saveError}
            </p>
          ) : null}
          <button
            className="content-drawer__save-button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </>
      }
      ariaLabel="Settings"
      footer={
        <span className="content-drawer__version">
          {APP_NAME} v{APP_VERSION}
        </span>
      }
      onClose={onClose}
      open={open}
      showActionBar={hasChanges}
      title="Settings"
      variant="settings"
    >
      <section className="content-drawer__section">
        <h3 className="content-drawer__section-title">Profile</h3>

        <div className="content-drawer__profile">
          <button
            className="content-drawer__avatar-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={profile.name}
                className="content-drawer__avatar-image"
                src={profile.avatar}
              />
            ) : (
              <span className="content-drawer__avatar-fallback">
                {profileInitial}
              </span>
            )}
            <span className="content-drawer__avatar-overlay">
              <Camera className="size-4" />
            </span>
          </button>
          <input
            accept="image/*"
            className="sr-only"
            onChange={handleAvatarChange}
            ref={fileInputRef}
            type="file"
          />

          <div className="content-drawer__profile-fields">
            <SettingsGroup>
              <SettingsItem>
                <input
                  aria-label="Name"
                  className="content-drawer__settings-input content-drawer__settings-input--plain"
                  onChange={(event) =>
                    updateDraftProfile({ name: event.target.value })
                  }
                  placeholder="Name"
                  type="text"
                  value={profile.name}
                />
              </SettingsItem>
              <SettingsItem>
                <input
                  aria-label="Email"
                  className="content-drawer__settings-input content-drawer__settings-input--plain content-drawer__settings-input--readonly"
                  placeholder="Email"
                  readOnly
                  type="email"
                  value={profile.email}
                />
              </SettingsItem>
            </SettingsGroup>
          </div>
        </div>
      </section>

      <section className="content-drawer__section content-drawer__section--compact">
        <h3 className="content-drawer__section-title">Notification update</h3>

        <SettingsGroup compact>
          <SettingsToggleRow
            checked={dailyUpdate.enabled}
            label="Daily update notifications"
            onCheckedChange={handleDailyUpdateToggle}
          />

          {dailyUpdate.enabled &&
          browserPermission !== "granted" &&
          browserPermission !== "unsupported" ? (
            <SettingsItem className="content-drawer__settings-item--permission">
              <button
                className="content-drawer__permission-button"
                disabled={isCheckingPermission}
                onClick={() => void handleAllowBrowserNotifications()}
                type="button"
              >
                {isCheckingPermission ? "Allowing..." : "Allow notifications"}
              </button>
            </SettingsItem>
          ) : notificationHint ? (
            <SettingsItem>
              <p className="content-drawer__settings-hint" role="alert">
                {notificationHint}
              </p>
            </SettingsItem>
          ) : null}

          {dailyUpdate.enabled ? (
            <>
              <SettingsToggleRow
                checked={dailyUpdate.morningEnabled}
                label="Morning update"
                onCheckedChange={(checked) =>
                  updateDraftDailyUpdate({ morningEnabled: checked })
                }
              >
                {dailyUpdate.morningEnabled ? (
                  <input
                    aria-label="Morning update time"
                    className="content-drawer__settings-input"
                    onChange={(event) =>
                      updateDraftDailyUpdate({
                        morningTime: event.target.value,
                      })
                    }
                    type="time"
                    value={dailyUpdate.morningTime}
                  />
                ) : null}
              </SettingsToggleRow>

              <SettingsToggleRow
                checked={dailyUpdate.eveningEnabled}
                label="Evening update"
                onCheckedChange={(checked) =>
                  updateDraftDailyUpdate({ eveningEnabled: checked })
                }
              >
                {dailyUpdate.eveningEnabled ? (
                  <input
                    aria-label="Evening update time"
                    className="content-drawer__settings-input"
                    onChange={(event) =>
                      updateDraftDailyUpdate({
                        eveningTime: event.target.value,
                      })
                    }
                    type="time"
                    value={dailyUpdate.eveningTime}
                  />
                ) : null}
              </SettingsToggleRow>

              <SettingsCheckboxRow
                checked={dailyUpdate.includeCompleted}
                label="Include tasks completed"
                onCheckedChange={(checked) =>
                  updateDraftDailyUpdate({ includeCompleted: checked })
                }
              />

              <SettingsCheckboxRow
                checked={dailyUpdate.includeRemaining}
                label="Include tasks remaining"
                onCheckedChange={(checked) =>
                  updateDraftDailyUpdate({ includeRemaining: checked })
                }
              />
            </>
          ) : null}
        </SettingsGroup>
      </section>

      <section className="content-drawer__section content-drawer__section--compact">
        <h3 className="content-drawer__section-title">Notification sound</h3>

        <SettingsGroup compact>
          {SOUND_OPTIONS.map((option) => (
            <SettingsSoundRow
              key={option.value}
              label={option.label}
              onPreview={() => playNotificationSound(option.value)}
              onSelect={() => updateDraftNotifications({ sound: option.value })}
              selected={notifications.sound === option.value}
              showPreview={option.value !== "none"}
            />
          ))}
        </SettingsGroup>
      </section>

      {onLogout ? (
        <section className="content-drawer__section content-drawer__section--mobile-only">
          <button
            className="content-drawer__logout-link"
            onClick={onLogout}
            type="button"
          >
            Logout
          </button>
        </section>
      ) : null}

    </ContentDrawer>
  )
}

function SettingsGroup({
  children,
  compact = false,
}: {
  children: React.ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`content-drawer__settings-group ${
        compact ? "content-drawer__settings-group--compact" : ""
      }`.trim()}
    >
      {children}
    </div>
  )
}

function SettingsItem({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`content-drawer__settings-item ${className}`.trim()}>
      {children}
    </div>
  )
}

function SettingsToggleRow({
  checked,
  children,
  label,
  onCheckedChange,
}: {
  checked: boolean
  children?: React.ReactNode
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <SettingsItem>
      <div className="content-drawer__settings-row">
        <span
          className={`content-drawer__settings-label ${
            checked ? "content-drawer__settings-label--active" : ""
          }`}
        >
          {label}
        </span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {children}
    </SettingsItem>
  )
}

function SettingsCheckboxRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <SettingsItem>
      <label className="content-drawer__settings-row content-drawer__settings-row--clickable">
        <span
          className={`content-drawer__settings-label ${
            checked ? "content-drawer__settings-label--active" : ""
          }`}
        >
          {label}
        </span>
        <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      </label>
    </SettingsItem>
  )
}

function SettingsSoundRow({
  label,
  onPreview,
  onSelect,
  selected,
  showPreview,
}: {
  label: string
  onPreview: () => void
  onSelect: () => void
  selected: boolean
  showPreview: boolean
}) {
  return (
    <SettingsItem>
      <div className="content-drawer__settings-row">
        <button
          className={`content-drawer__settings-sound-select ${
            selected ? "content-drawer__settings-sound-select--active" : ""
          }`}
          onClick={onSelect}
          type="button"
        >
          <span className="content-drawer__settings-check" aria-hidden="true">
            {selected ? <Check className="size-3.5" /> : null}
          </span>
          <span>{label}</span>
        </button>

        {showPreview ? (
          <button
            aria-label={`Preview ${label}`}
            className="content-drawer__settings-preview"
            onClick={onPreview}
            type="button"
          >
            <Volume2 className="size-4" />
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="content-drawer__settings-preview content-drawer__settings-preview--disabled"
          />
        )}
      </div>
    </SettingsItem>
  )
}

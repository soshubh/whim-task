"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PanelLeftIcon, Search, XIcon } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { AppSidebar, type ShellSection } from "@/components/app-sidebar"
import { DailyPlannerView } from "@/components/daily-planner-view"
import { HomeDashboard } from "@/components/home-dashboard"
import { NotificationsLayer } from "@/components/notifications-layer"
import { PlannerProvider } from "@/components/planner-provider"
import { PomodoroView } from "@/components/pomodoro-view"
import {
  ReminderUiProvider,
  useReminderUi,
} from "@/components/reminder-ui-provider"
import { SettingsLayer } from "@/components/settings-layer"
import {
  SettingsProvider,
  useSettings,
} from "@/components/settings-provider"
import { GET_STARTED_PATH } from "@/lib/app-meta"
import { Button } from "@/components/ui/button"

const sectionTitles: Record<ShellSection, string> = {
  home: "Home",
  pomodoro: "Pomodoro",
  "daily-planner": "Daily Planner",
}

const sectionSearchPlaceholders: Record<ShellSection, string> = {
  home: "Search your workspace",
  pomodoro: "Search tasks",
  "daily-planner": "Search your workspace",
}

function AppShell() {
  const router = useRouter()
  const { isAuthenticated, isLoading, signOut } = useAuth()
  const [activeSection, setActiveSection] =
    React.useState<ShellSection>("home")
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)
  const {
    bellShaking,
    closeNotifications,
    notificationCount,
    openNotifications,
  } = useReminderUi()
  const { closeSettings, openSettings, settings } = useSettings()

  const handleOpenNotifications = React.useCallback(() => {
    closeSettings()
    openNotifications()
  }, [closeSettings, openNotifications])

  const handleOpenSettings = React.useCallback(() => {
    closeNotifications()
    openSettings()
  }, [closeNotifications, openSettings])

  const handleLogout = React.useCallback(() => {
    closeNotifications()
    closeSettings()
    void signOut().then(() => {
      router.replace(GET_STARTED_PATH)
    })
  }, [closeNotifications, closeSettings, router, signOut])

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(GET_STARTED_PATH)
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated) {
    return null
  }

  return (
    <>
      <AppSidebar
        activeSection={activeSection}
        bellShaking={bellShaking}
        isMobileOpen={isMobileOpen}
        notificationCount={notificationCount}
        onCloseMobile={() => setIsMobileOpen(false)}
        onOpenNotifications={handleOpenNotifications}
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
        onSectionChange={setActiveSection}
        profile={settings.profile}
      />

      <main className="app-main">
        <div className="app-main__frame">
          <div className="app-main__mobile-bar">
            <Button
              className="app-mobile-trigger"
              onClick={() => setIsMobileOpen((open) => !open)}
              size="icon"
              variant="outline"
            >
              {isMobileOpen ? <XIcon /> : <PanelLeftIcon />}
              <span className="sr-only">Toggle navigation</span>
            </Button>
            <span className="app-main__mobile-label">
              {sectionTitles[activeSection]}
            </span>
          </div>

          <header className="app-main__header">
            <div className="app-main__header-copy">
              <h1 className="app-main__title">
                Hi, {settings.profile.name}!
              </h1>
              <p className="app-main__subtitle">
                {sectionTitles[activeSection]}
              </p>
            </div>

            <div className="app-main__header-actions">
              <label className="app-main__search" htmlFor="app-main-search">
                <Search className="app-main__search-icon" />
                <input
                  aria-label={`Search ${sectionTitles[activeSection]}`}
                  className="app-main__search-input"
                  id="app-main-search"
                  placeholder={sectionSearchPlaceholders[activeSection]}
                  type="search"
                />
              </label>
            </div>
          </header>

          <div
            className="app-main__content"
            aria-label={`${activeSection} content`}
          >
            <div className="app-main__content-stage">
              {activeSection === "home" ? <HomeDashboard /> : null}
              {activeSection === "pomodoro" ? <PomodoroView /> : null}
              {activeSection === "daily-planner" ? <DailyPlannerView /> : null}
            </div>
            <NotificationsLayer />
            <SettingsLayer />
          </div>
        </div>
      </main>
    </>
  )
}

export default function Page() {
  return (
    <div className="app-body">
      <PlannerProvider>
        <SettingsProvider>
          <ReminderUiProvider>
            <AppShell />
          </ReminderUiProvider>
        </SettingsProvider>
      </PlannerProvider>
    </div>
  )
}

"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Bell, CalendarDays, Home, Search, Sparkles } from "lucide-react"

import { AppDataLoadingOverlay } from "@/components/app-data-loading-overlay"
import { useAuth } from "@/components/auth-provider"
import { AppSidebar, type ShellSection } from "@/components/app-sidebar"
import { DailyPlannerView } from "@/components/daily-planner-view"
import { HomeDashboard } from "@/components/home-dashboard"
import { NotificationBadge } from "@/components/notification-badge"
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
import {
  readShellSectionFromLocation,
  writeShellSectionToLocation,
} from "@/lib/shell-navigation"
import { cn } from "@/lib/utils"

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

const mobileNavItems: Array<{
  key: ShellSection
  label: string
  icon: React.ReactNode
}> = [
  { key: "home", label: "Home", icon: <Home className="size-5" /> },
  {
    key: "daily-planner",
    label: "Daily Planner",
    icon: <CalendarDays className="size-5" />,
  },
  {
    key: "pomodoro",
    label: "Pomodoro",
    icon: <Sparkles className="size-5" />,
  },
]

function AppShell() {
  const router = useRouter()
  const { isAuthenticated, isLoading, signOut } = useAuth()
  const [activeSection, setActiveSection] =
    React.useState<ShellSection>("home")
  const [isSectionReady, setIsSectionReady] = React.useState(false)
  const {
    bellShaking,
    clearToasts,
    closeNotifications,
    notificationCount,
    notificationsOpen,
    openNotifications,
  } = useReminderUi()
  const { closeSettings, openSettings, settings } = useSettings()

  const handleOpenNotifications = React.useCallback(() => {
    closeSettings()
    openNotifications()
  }, [closeSettings, openNotifications])

  const handleOpenSettings = React.useCallback(() => {
    closeNotifications()
    clearToasts()
    openSettings()
  }, [clearToasts, closeNotifications, openSettings])

  const handleLogout = React.useCallback(() => {
    closeNotifications()
    closeSettings()
    void signOut().then(() => {
      router.replace(GET_STARTED_PATH)
    })
  }, [closeNotifications, closeSettings, router, signOut])

  const handleSectionChange = React.useCallback((section: ShellSection) => {
    setActiveSection(section)
    writeShellSectionToLocation(section)
  }, [])

  React.useEffect(() => {
    if (isLoading) {
      return
    }

    setActiveSection(readShellSectionFromLocation())
    setIsSectionReady(true)
  }, [isLoading])

  React.useEffect(() => {
    const handlePopState = () => {
      setActiveSection(readShellSectionFromLocation())
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [])

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(GET_STARTED_PATH)
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated || !isSectionReady) {
    return null
  }

  const profileInitial = (
    settings.profile.name.trim()[0] ||
    settings.profile.email.trim()[0] ||
    "U"
  ).toUpperCase()

  const sidebarNotificationCount = notificationsOpen ? 0 : notificationCount

  return (
    <>
      <AppSidebar
        activeSection={activeSection}
        bellShaking={bellShaking}
        isMobileOpen={false}
        notificationCount={sidebarNotificationCount}
        onCloseMobile={() => undefined}
        onOpenNotifications={handleOpenNotifications}
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
        onSectionChange={handleSectionChange}
        profile={settings.profile}
      />

      <main className="app-main">
        <div className="app-main__frame">
          <header className="app-mobile-header">
            <div className="app-mobile-header__brand">
              <Image
                alt="Whim Task logo"
                className="app-mobile-header__logo"
                height={40}
                src="/Log.png"
                width={40}
              />
              <div className="app-mobile-header__copy">
                <h1 className="app-mobile-header__title">
                  Hi, {settings.profile.name}!
                </h1>
                <p className="app-mobile-header__subtitle">
                  {sectionTitles[activeSection]}
                </p>
              </div>
            </div>

            <div className="app-mobile-header__actions">
              <button
                aria-label="Notifications"
                className={cn(
                  "app-mobile-header__bell",
                  bellShaking && "app-mobile-header__bell--shake",
                )}
                onClick={handleOpenNotifications}
                type="button"
              >
                <Bell className="size-5" />
                <NotificationBadge count={sidebarNotificationCount} />
              </button>

              <button
                aria-label="Open settings"
                className="app-mobile-header__profile"
                onClick={handleOpenSettings}
                type="button"
              >
                {settings.profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={settings.profile.name}
                    className="app-mobile-header__avatar"
                    src={settings.profile.avatar}
                  />
                ) : (
                  <span className="app-mobile-header__avatar-fallback">
                    {profileInitial}
                  </span>
                )}
              </button>
            </div>
          </header>

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
            <SettingsLayer onLogout={handleLogout} />
          </div>
        </div>
      </main>

      <nav
        aria-label="Primary navigation"
        className="app-mobile-nav"
      >
        {mobileNavItems.map((item) => (
          <button
            aria-current={activeSection === item.key ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "app-mobile-nav__item",
              activeSection === item.key && "app-mobile-nav__item--active",
            )}
            key={item.key}
            onClick={() => handleSectionChange(item.key)}
            type="button"
          >
            {item.icon}
          </button>
        ))}
      </nav>
    </>
  )
}

export default function Page() {
  return (
    <div className="app-body">
      <PlannerProvider>
        <AppDataLoadingOverlay />
        <SettingsProvider>
          <ReminderUiProvider>
            <AppShell />
          </ReminderUiProvider>
        </SettingsProvider>
      </PlannerProvider>
    </div>
  )
}

"use client";

import Image from "next/image";
import {
  Bell,
  CalendarDays,
  Home,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";

import { NotificationBadge } from "@/components/notification-badge";
import type { UserProfile } from "@/lib/settings";
import { cn } from "@/lib/utils";

export type ShellSection = "home" | "pomodoro" | "daily-planner";

const items: Array<{
  key: ShellSection;
  title: string;
  icon: React.ReactNode;
}> = [
  { key: "home", title: "Home", icon: <Home className="size-6" /> },
  {
    key: "daily-planner",
    title: "Daily Planner",
    icon: <CalendarDays className="size-6" />,
  },
  { key: "pomodoro", title: "Pomodoro", icon: <Sparkles className="size-6" /> },
];

const utilityItems = [
  {
    key: "notifications",
    title: "Notifications",
    icon: <Bell className="size-6" />,
  },
  { key: "settings", title: "Settings", icon: <Settings className="size-6" /> },
];

export function AppSidebar({
  activeSection,
  bellShaking = false,
  isMobileOpen,
  notificationCount = 0,
  onCloseMobile,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
  onSectionChange,
  profile,
}: {
  activeSection: ShellSection;
  bellShaking?: boolean;
  isMobileOpen: boolean;
  notificationCount?: number;
  onCloseMobile: () => void;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onSectionChange: (section: ShellSection) => void;
  profile: UserProfile;
}) {
  const profileInitial = (
    profile.name.trim()[0] ||
    profile.email.trim()[0] ||
    "U"
  ).toUpperCase();

  const renderItem = ({
    badgeCount,
    icon,
    isBell = false,
    key,
    title,
    onClick,
    isActive = false,
    shakeBell = false,
  }: {
    badgeCount?: number;
    icon: React.ReactNode;
    isBell?: boolean;
    key: string;
    title: string;
    onClick?: () => void;
    isActive?: boolean;
    shakeBell?: boolean;
  }) => (
    <div className="app-sidebar__slot" key={key}>
      <button
        aria-label={title}
        className={cn(
          "app-sidebar__item",
          isActive && "app-sidebar__item--active",
          shakeBell && "app-sidebar__item--bell-shake",
        )}
        onClick={onClick}
        type="button"
      >
        {isBell ? <span className="app-sidebar__bell-icon">{icon}</span> : icon}
        {badgeCount !== undefined ? (
          <NotificationBadge count={badgeCount} />
        ) : null}
      </button>
      <span className="app-sidebar__tooltip" role="presentation">
        {title}
      </span>
    </div>
  );

  return (
    <aside className={cn("app-sidebar", isMobileOpen && "app-sidebar--open")}>
      <Image
        alt="Whim Task logo"
        className="app-sidebar__logo"
        height={48}
        src="/Log.png"
        width={48}
      />

      <nav className="app-sidebar__nav" aria-label="Primary navigation">
        {items.map((item) =>
          renderItem({
            icon: item.icon,
            key: item.key,
            title: item.title,
            isActive: activeSection === item.key,
            onClick: () => {
              onSectionChange(item.key);
              onCloseMobile();
            },
          }),
        )}
      </nav>

      <div className="app-sidebar__bottom">
        <div className="app-sidebar__utilities" aria-label="Utility actions">
          {utilityItems.map((item) =>
            renderItem({
              badgeCount:
                item.key === "notifications" ? notificationCount : undefined,
              icon: item.icon,
              isBell: item.key === "notifications",
              key: item.key,
              shakeBell: item.key === "notifications" && bellShaking,
              title: item.title,
              onClick:
                item.key === "notifications"
                  ? onOpenNotifications
                  : item.key === "settings"
                    ? onOpenSettings
                    : undefined,
            }),
          )}
        </div>

        <div className="app-sidebar__footer">
          {renderItem({
            icon: <LogOut className="size-6" />,
            key: "logout",
            title: "Logout",
            onClick: onLogout,
          })}

          <div className="app-sidebar__slot">
            <div className="app-sidebar__profile" aria-hidden="true">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={profile.name}
                  className="app-sidebar__profile-avatar"
                  src={profile.avatar}
                />
              ) : (
                <div className="app-sidebar__profile-avatar">
                  {profileInitial}
                </div>
              )}
            </div>
            <span className="app-sidebar__tooltip" role="presentation">
              {profile.email}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

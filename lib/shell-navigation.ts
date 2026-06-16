import type { ShellSection } from "@/components/app-sidebar"

export const SHELL_SECTIONS: ShellSection[] = [
  "home",
  "daily-planner",
  "pomodoro",
]

export const SHELL_SECTION_QUERY_KEY = "section"

export function parseShellSection(value: string | null): ShellSection | null {
  if (value && SHELL_SECTIONS.includes(value as ShellSection)) {
    return value as ShellSection
  }

  return null
}

export function readShellSectionFromLocation(): ShellSection {
  if (typeof window === "undefined") {
    return "home"
  }

  return (
    parseShellSection(
      new URLSearchParams(window.location.search).get(SHELL_SECTION_QUERY_KEY),
    ) ?? "home"
  )
}

export function writeShellSectionToLocation(section: ShellSection) {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)

  if (section === "home") {
    url.searchParams.delete(SHELL_SECTION_QUERY_KEY)
  } else {
    url.searchParams.set(SHELL_SECTION_QUERY_KEY, section)
  }

  window.history.replaceState(window.history.state, "", url)
}

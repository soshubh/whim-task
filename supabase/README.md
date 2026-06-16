# Whim Task — Supabase setup

App data is stored in **normalized tables** (not JSON snapshots). The UI updates instantly in memory; changes sync to Supabase in the background and propagate to other devices via **Realtime**.

## Run these SQL files in order (Supabase SQL Editor)

**Easiest:** paste and run one file:

| File | Purpose |
|------|---------|
| `setup-normalized-sync-all-in-one.sql` | **Everything in one script** (migrate + drop old table + realtime) |

**Prerequisite** (first time only): `migrations/20250615000000_initial_schema.sql`

**Or step-by-step** (same result):

See `RUN-IN-ORDER.sql` for a quick checklist.

## Tables used by the app

| Table | Data |
|-------|------|
| `profiles` | Name, email, avatar |
| `notification_settings` | Browser notifications, sounds, daily updates |
| `routines` | Recurring task rules |
| `planner_days` | Per-day draft / UI flags |
| `planner_tasks` | Tasks (active + completed) |
| `reminders` | Task & routine reminders |
| `pomodoro_timer_settings` | Focus / break durations |
| `pomodoro_sessions` | Completed focus session logs |
| `daily_update_logs` | Morning/evening update markers |

## How sync works in the app

1. **Instant UI** — edits update in-memory state immediately (`lib/cloud-store.ts`).
2. **Background save** — debounced write to normalized tables (~200ms).
3. **Other devices** — Supabase Realtime triggers a debounced reload (~150ms).
4. **No localStorage** for app data — only Supabase + in-memory cache while signed in.

## Environment variables

Both Vercel deployments (mobile + desktop) must use the same:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

-- Cross-device app data sync (mirrors browser localStorage shape)

create table public.user_sync_snapshots (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  planner_state jsonb not null default '{}'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  reminders jsonb not null default '[]'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  pomodoro_timer_defaults jsonb not null default '{"focus":1500,"short-break":300,"long-break":900}'::jsonb,
  pomodoro_sessions_by_date jsonb not null default '{}'::jsonb,
  daily_update_marker text,
  updated_at timestamptz not null default now()
);

create trigger user_sync_snapshots_set_updated_at
before update on public.user_sync_snapshots
for each row execute function public.set_updated_at();

alter table public.user_sync_snapshots enable row level security;

create policy "user_sync_snapshots_select_own"
on public.user_sync_snapshots for select
to authenticated
using (user_id = auth.uid());

create policy "user_sync_snapshots_insert_own"
on public.user_sync_snapshots for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_sync_snapshots_update_own"
on public.user_sync_snapshots for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

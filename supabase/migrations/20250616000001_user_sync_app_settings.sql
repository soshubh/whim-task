-- Store full app settings in sync snapshots + enable realtime updates

alter table public.user_sync_snapshots
add column if not exists app_settings jsonb not null default '{}'::jsonb;

alter table public.user_sync_snapshots replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.user_sync_snapshots;
exception
  when duplicate_object then null;
end $$;

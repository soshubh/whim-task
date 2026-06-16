-- =============================================================================
-- Whim Task — Drop legacy JSON snapshot sync table
-- Run AFTER 01-schema-fixes + 02-migrate-snapshot-to-tables.sql
-- =============================================================================

do $$
begin
  alter publication supabase_realtime drop table public.user_sync_snapshots;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

drop trigger if exists user_sync_snapshots_set_updated_at on public.user_sync_snapshots;

drop policy if exists "user_sync_snapshots_select_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_insert_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_update_own" on public.user_sync_snapshots;
drop policy if exists "user_sync_snapshots_delete_own" on public.user_sync_snapshots;

drop table if exists public.user_sync_snapshots cascade;

drop function if exists public.migrate_user_sync_snapshot(uuid);

select 'user_sync_snapshots removed' as status;

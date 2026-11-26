-- PAYZIK — Migration 5/5 : temps réel pour les demandes de recharge.
-- Non destructif.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recharge_requests'
  ) then
    alter publication supabase_realtime add table public.recharge_requests;
  end if;
end $$;
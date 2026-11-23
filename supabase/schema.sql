-- PAYZIK — schéma minimal de démonstration (plan gratuit Supabase).
-- À exécuter dans le SQL Editor du projet Supabase.

create table if not exists public.payzik_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.payzik_state enable row level security;

-- ⚠️ Ces policies rendent la table publique : c'est un espace de DÉMO partagé.
-- Remplace-les par des policies basées sur auth.uid() avant toute donnée réelle.
drop policy if exists "demo_read" on public.payzik_state;
create policy "demo_read"
  on public.payzik_state for select
  to anon, authenticated
  using (true);

drop policy if exists "demo_write" on public.payzik_state;
create policy "demo_write"
  on public.payzik_state for all
  to anon, authenticated
  using (true)
  with check (true);

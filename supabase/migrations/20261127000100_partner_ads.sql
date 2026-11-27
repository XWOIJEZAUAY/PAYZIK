-- PAYZIK — Migration 12/12 : emplacements publicitaires partenaires réels.
-- Non destructif. Exécuter UNE SEULE FOIS, sans autre requête concurrente.
SET lock_timeout = '30s';
SET statement_timeout = '120s';

-- Une annonce n'est affichée que si elle est active, datée et fournie par un partenaire réel.
create table if not exists public.partner_ads (
  id uuid primary key default extensions.uuid_generate_v4(),
  company_name text not null,
  title text not null,
  subtitle text,
  image_url text,
  cta_label text not null default 'Découvrir',
  cta_url text,
  placement text not null default 'home' check (placement in ('home', 'shops', 'catalog')),
  weight integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists partner_ads_live_idx
  on public.partner_ads (placement, is_active, weight desc, created_at desc);

alter table public.partner_ads enable row level security;

-- Lecture seule : le client ne voit que les annonces actives et dans leur fenêtre de diffusion.
drop policy if exists "partner_ads_select_active" on public.partner_ads;
create policy "partner_ads_select_active" on public.partner_ads
for select to authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

-- Aucune écriture depuis le frontend : saisie uniquement via le Dashboard Supabase (service role).
revoke insert, update, delete on public.partner_ads from authenticated, anon;

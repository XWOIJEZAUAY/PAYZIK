-- PAYZIK — Migration 1/3 : socle multi-boutiques, relations, cartes, ledger.
-- Non destructif : aucune donnée existante n'est supprimée ni réécrite.
-- Les lignes historiques sans shop_id restent lisibles par leur propriétaire
-- uniquement (voir migration 3/3).

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- RÔLES
-- ============================================================
do $$
declare
  c name;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%';

  if c is not null then
    execute format('alter table public.profiles drop constraint %I', c);
  end if;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('merchant', 'customer', 'admin'));
end $$;

-- Empêche un client de s'auto-promouvoir admin via UPDATE profiles.
create or replace function public.payzik_profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     ) then
    raise exception 'role_change_forbidden'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists payzik_profiles_role_guard on public.profiles;
create trigger payzik_profiles_role_guard
before update on public.profiles
for each row execute function public.payzik_profiles_role_guard();

-- ============================================================
-- COLONNES DE SCOPING SUR LES TABLES EXISTANTES
-- ============================================================
alter table public.products   add column if not exists shop_id uuid;
alter table public.sales      add column if not exists shop_id uuid;
alter table public.kridi      add column if not exists shop_id uuid;
alter table public.promotions add column if not exists shop_id uuid;

alter table public.cards
  add column if not exists card_type text not null default 'shop',
  add column if not exists shop_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists pin_hash text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists idempotency_key text;

-- Les anciennes cartes n'ont pas de shop_id : on ne les réécrit pas,
-- on refuse simplement leur utilisation tant qu'elles ne sont pas migrées.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cards_type_shop_scope' and conrelid = 'public.cards'::regclass
  ) then
    alter table public.cards
      add constraint cards_type_shop_scope
      check (
        (card_type = 'shop' and shop_id is not null)
        or (card_type = 'general' and shop_id is null)
      )
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cards_status_check' and conrelid = 'public.cards'::regclass
  ) then
    alter table public.cards
      add constraint cards_status_check
      check (status in ('active', 'blocked'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cards_type_check' and conrelid = 'public.cards'::regclass
  ) then
    alter table public.cards
      add constraint cards_type_check
      check (card_type in ('shop', 'general'));
  end if;
end $$;

create unique index if not exists cards_one_active_general_per_client
  on public.cards (owner_id)
  where card_type = 'general' and status = 'active' and owner_id is not null;

create unique index if not exists cards_created_idem
  on public.cards (created_by, idempotency_key)
  where idempotency_key is not null;

create index if not exists cards_shop_id_idx on public.cards (shop_id);
create index if not exists products_shop_id_idx on public.products (shop_id);
create index if not exists sales_shop_id_idx on public.sales (shop_id);
create index if not exists kridi_shop_id_idx on public.kridi (shop_id);

-- ============================================================
-- BOUTIQUES
-- ============================================================
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  shop_name text not null,
  verified boolean not null default false,
  in_network boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shops_owner_name_uq' and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_owner_name_uq unique (owner_user_id, shop_name);
  end if;
end $$;

create index if not exists shops_network_idx
  on public.shops (verified, in_network, is_active);

alter table public.shops enable row level security;

-- Autorisations explicites complémentaires à la propriété.
create table if not exists public.shop_admins (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('manager', 'seller', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists shop_admins_uq
  on public.shop_admins (shop_id, user_id);

alter table public.shop_admins enable row level security;

-- ============================================================
-- RELATIONS CLIENTS ↔ BOUTIQUES
-- ============================================================
create table if not exists public.shop_clients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  linked_by uuid not null references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  linked_at timestamptz not null default now()
);

create unique index if not exists shop_clients_uq
  on public.shop_clients (shop_id, client_id);

create index if not exists shop_clients_client_idx
  on public.shop_clients (client_id, status);

alter table public.shop_clients enable row level security;

-- ============================================================
-- TOKENS DE LIAGE QR (jamais d'identifiant ni de secret brut)
-- ============================================================
create table if not exists public.link_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  token_hash text not null unique,
  client_id uuid references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists link_tokens_shop_idx
  on public.link_tokens (shop_id, expires_at);

alter table public.link_tokens enable row level security;

-- ============================================================
-- LEDGER FINANCIER (source de vérité des mouvements)
-- ============================================================
create table if not exists public.card_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete restrict,
  card_id text references public.cards(id) on delete restrict,
  transaction_type text not null check (
    transaction_type in (
      'shop_card_recharge', 'general_card_recharge',
      'shop_card_payment', 'general_card_payment',
      'credit_sale', 'repayment', 'refund', 'adjustment'
    )
  ),
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'reversed', 'failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  reference text,
  description text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists card_transactions_idem_uq
  on public.card_transactions (created_by, idempotency_key)
  where idempotency_key is not null;

create index if not exists card_transactions_shop_idx
  on public.card_transactions (shop_id, created_at desc);

create index if not exists card_transactions_client_idx
  on public.card_transactions (client_id, created_at desc);

create index if not exists card_transactions_card_idx
  on public.card_transactions (card_id, created_at desc);

alter table public.card_transactions enable row level security;

-- Contrepartie comptable côté boutique pour les paiements carte générale.
create table if not exists public.shop_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  transaction_id uuid not null references public.card_transactions(id) on delete restrict,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists shop_ledger_shop_idx
  on public.shop_ledger (shop_id, created_at desc);

alter table public.shop_ledger enable row level security;

-- ============================================================
-- CRÉDIT / KRIDI AUDITABLE
-- ============================================================
create table if not exists public.credit_sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  client_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  reference text,
  lines jsonb not null default '[]'::jsonb,
  total_dh numeric(14, 2) not null check (total_dh > 0),
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_sales_idem_uq
  on public.credit_sales (shop_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists credit_sales_shop_idx
  on public.credit_sales (shop_id, created_at desc);

alter table public.credit_sales enable row level security;

create table if not exists public.credit_repayments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.credit_sales(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  client_id uuid not null references auth.users(id) on delete restrict,
  amount_dh numeric(14, 2) not null check (amount_dh > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  reference text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_repayments_idem_uq
  on public.credit_repayments (shop_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists credit_repayments_shop_idx
  on public.credit_repayments (shop_id, created_at desc);

alter table public.credit_repayments enable row level security;

-- ============================================================
-- JOURNAL D'AUDIT
-- ============================================================
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  shop_id uuid,
  client_id uuid,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_shop_idx
  on public.audit_log (shop_id, created_at desc);

create index if not exists audit_log_actor_idx
  on public.audit_log (actor_user_id, created_at desc);

alter table public.audit_log enable row level security;

-- ============================================================
-- REALTIME : uniquement après COMMIT des RPC, filtré par les politiques RLS.
-- ============================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'card_transactions', 'shop_ledger', 'credit_sales',
      'credit_repayments', 'shop_clients', 'shops'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

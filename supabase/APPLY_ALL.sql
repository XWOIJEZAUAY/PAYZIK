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


-- PAYZIK — Migration 2/3 : helpers d'autorisation + RLS stricte.
-- Toutes les identités sont prises depuis auth.uid(), jamais depuis le payload.

-- ============================================================
-- FONCTIONS D'AUTORISATION (SECURITY DEFINER, search_path verrouillé)
-- ============================================================
create or replace function public.payzik_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.payzik_role(p_expected_role text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = p_expected_role
  );
$$;

create or replace function public.payzik_can_manage_shop(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    p_shop is not null
    and (
      public.payzik_is_admin()
      or exists (
        select 1 from public.shops s
        where s.id = p_shop and s.owner_user_id = auth.uid()
      )
      or exists (
        select 1 from public.shop_admins a
        where a.shop_id = p_shop
          and a.user_id = auth.uid()
          and a.is_active
      )
    );
$$;

create or replace function public.payzik_is_linked_client(p_shop uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.shop_clients sc
    where sc.shop_id = p_shop
      and sc.client_id = p_client
      and sc.status = 'active'
  );
$$;

create or replace function public.payzik_eligible_shop(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.shops s
    where s.id = p_shop
      and s.verified
      and s.in_network
      and s.is_active
  );
$$;

create or replace function public.payzik_assert_amount(p_amount numeric)
returns void
language plpgsql
immutable
as $$
begin
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
end $$;

create or replace function public.payzik_audit(
  p_action text,
  p_shop uuid default null,
  p_client uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.audit_log (
    actor_user_id, action, shop_id, client_id, entity_type, entity_id, details
  ) values (
    auth.uid(), p_action, p_shop, p_client, p_entity_type, p_entity_id,
    coalesce(p_details, '{}'::jsonb)
  );
end $$;

revoke all on function public.payzik_is_admin() from public, anon;
revoke all on function public.payzik_role(text) from public, anon;
revoke all on function public.payzik_can_manage_shop(uuid) from public, anon;
revoke all on function public.payzik_is_linked_client(uuid, uuid) from public, anon;
revoke all on function public.payzik_eligible_shop(uuid) from public, anon;
revoke all on function public.payzik_assert_amount(numeric) from public, anon;
revoke all on function public.payzik_audit(text, uuid, uuid, text, text, jsonb) from public, anon;

grant execute on function public.payzik_is_admin() to authenticated;
grant execute on function public.payzik_role(text) to authenticated;
grant execute on function public.payzik_can_manage_shop(uuid) to authenticated;
grant execute on function public.payzik_is_linked_client(uuid, uuid) to authenticated;
grant execute on function public.payzik_eligible_shop(uuid) to authenticated;
grant execute on function public.payzik_assert_amount(numeric) to authenticated;
grant execute on function public.payzik_audit(text, uuid, uuid, text, text, jsonb) to authenticated;

-- ============================================================
-- PROFILS : plus de lecture globale, rôle non modifiable par le client.
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_scoped" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.payzik_is_admin()
  or exists (
    select 1 from public.shop_clients sc
    where sc.client_id = id
      and public.payzik_can_manage_shop(sc.shop_id)
  )
);

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (
  id = auth.uid()
  and role in ('merchant', 'customer')
);

create policy "profiles_update_own" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ============================================================
-- PRODUITS : scoping boutique. Les lignes héritées sans shop_id restent
-- visibles uniquement par leur marchand d'origine.
-- ============================================================
alter table public.products enable row level security;

drop policy if exists "products_select_all" on public.products;
drop policy if exists "products_select_scoped" on public.products;
drop policy if exists "products_write_own" on public.products;
drop policy if exists "products_write_scoped" on public.products;

create policy "products_select_scoped" on public.products
for select to authenticated
using (
  public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
  or (shop_id is null and merchant_id = auth.uid())
);

create policy "products_write_scoped" on public.products
for all to authenticated
using (
  public.payzik_can_manage_shop(shop_id)
  or (shop_id is null and merchant_id = auth.uid())
)
with check (
  merchant_id = auth.uid()
  and (
    public.payzik_can_manage_shop(shop_id)
    or (shop_id is null and merchant_id = auth.uid())
  )
);

-- ============================================================
-- VENTES
-- ============================================================
alter table public.sales enable row level security;

drop policy if exists "sales_select_own_or_customer" on public.sales;
drop policy if exists "sales_insert_merchant" on public.sales;
drop policy if exists "sales_select_scoped" on public.sales;
drop policy if exists "sales_insert_scoped" on public.sales;

create policy "sales_select_scoped" on public.sales
for select to authenticated
using (
  public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
  or (shop_id is null and merchant_id = auth.uid())
  or (
    shop_id is not null
    and customer_id = auth.uid()
    and public.payzik_is_linked_client(shop_id, auth.uid())
  )
);

create policy "sales_insert_scoped" on public.sales
for insert to authenticated
with check (
  merchant_id = auth.uid()
  and (
    shop_id is null
    or public.payzik_can_manage_shop(shop_id)
  )
  and (
    customer_id is null
    or shop_id is null
    or public.payzik_is_linked_client(shop_id, customer_id)
  )
);

-- ============================================================
-- KRIDI (crédit historique) : écriture uniquement via RPC auditable.
-- ============================================================
alter table public.kridi enable row level security;

drop policy if exists "kridi_select_own" on public.kridi;
drop policy if exists "kridi_insert_merchant" on public.kridi;
drop policy if exists "kridi_select_scoped" on public.kridi;

create policy "kridi_select_scoped" on public.kridi
for select to authenticated
using (
  public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
  or (shop_id is null and merchant_id = auth.uid())
  or (
    shop_id is not null
    and customer_id = auth.uid()
    and public.payzik_is_linked_client(shop_id, auth.uid())
  )
);

revoke insert, update, delete on public.kridi from authenticated, anon;

-- ============================================================
-- PROMOTIONS
-- ============================================================
alter table public.promotions enable row level security;

drop policy if exists "promotions_select_all" on public.promotions;
drop policy if exists "promotions_write_own" on public.promotions;
drop policy if exists "promotions_select_scoped" on public.promotions;
drop policy if exists "promotions_write_scoped" on public.promotions;

create policy "promotions_select_scoped" on public.promotions
for select to authenticated
using (
  merchant_id = auth.uid()
  or public.payzik_is_admin()
  or (
    active
    and exists (
      select 1 from public.shops s
      where s.owner_user_id = merchant_id
        and s.verified and s.in_network and s.is_active
    )
  )
);

create policy "promotions_write_scoped" on public.promotions
for all to authenticated
using (
  merchant_id = auth.uid()
  or public.payzik_can_manage_shop(shop_id)
)
with check (
  merchant_id = auth.uid()
  and (shop_id is null or public.payzik_can_manage_shop(shop_id))
);

-- ============================================================
-- CARTES : lecture ciblée, aucune écriture directe (RPC uniquement).
-- ============================================================
alter table public.cards enable row level security;

drop policy if exists "cards_select_own" on public.cards;
drop policy if exists "cards_insert_own" on public.cards;
drop policy if exists "cards_select_scoped" on public.cards;

create policy "cards_select_scoped" on public.cards
for select to authenticated
using (
  owner_id = auth.uid()
  or public.payzik_is_admin()
  or (shop_id is not null and public.payzik_can_manage_shop(shop_id))
);

revoke insert, update, delete on public.cards from authenticated, anon;

-- ============================================================
-- BOUTIQUES / AUTORISATIONS / RELATIONS / TOKENS
-- ============================================================
alter table public.shops enable row level security;
drop policy if exists "shops_select_scoped" on public.shops;
create policy "shops_select_scoped" on public.shops
for select to authenticated
using (
  owner_user_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(id)
  or (verified and in_network and is_active)
);
revoke insert, update, delete on public.shops from authenticated, anon;

alter table public.shop_admins enable row level security;
drop policy if exists "shop_admins_select_scoped" on public.shop_admins;
create policy "shop_admins_select_scoped" on public.shop_admins
for select to authenticated
using (
  user_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.shop_admins from authenticated, anon;

alter table public.shop_clients enable row level security;
drop policy if exists "shop_clients_select_scoped" on public.shop_clients;
create policy "shop_clients_select_scoped" on public.shop_clients
for select to authenticated
using (
  client_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.shop_clients from authenticated, anon;

alter table public.link_tokens enable row level security;
drop policy if exists "link_tokens_select_scoped" on public.link_tokens;
create policy "link_tokens_select_scoped" on public.link_tokens
for select to authenticated
using (
  public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.link_tokens from authenticated, anon;

-- ============================================================
-- LEDGER / CRÉDIT / AUDIT : lecture seule, écritures via RPC.
-- ============================================================
alter table public.card_transactions enable row level security;
drop policy if exists "card_transactions_select_scoped" on public.card_transactions;
create policy "card_transactions_select_scoped" on public.card_transactions
for select to authenticated
using (
  client_id = auth.uid()
  or public.payzik_is_admin()
  or (shop_id is not null and public.payzik_can_manage_shop(shop_id))
);
revoke insert, update, delete on public.card_transactions from authenticated, anon;

alter table public.shop_ledger enable row level security;
drop policy if exists "shop_ledger_select_scoped" on public.shop_ledger;
create policy "shop_ledger_select_scoped" on public.shop_ledger
for select to authenticated
using (
  public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.shop_ledger from authenticated, anon;

alter table public.credit_sales enable row level security;
drop policy if exists "credit_sales_select_scoped" on public.credit_sales;
create policy "credit_sales_select_scoped" on public.credit_sales
for select to authenticated
using (
  client_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.credit_sales from authenticated, anon;

alter table public.credit_repayments enable row level security;
drop policy if exists "credit_repayments_select_scoped" on public.credit_repayments;
create policy "credit_repayments_select_scoped" on public.credit_repayments
for select to authenticated
using (
  client_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(shop_id)
);
revoke insert, update, delete on public.credit_repayments from authenticated, anon;

alter table public.audit_log enable row level security;
drop policy if exists "audit_log_select_scoped" on public.audit_log;
create policy "audit_log_select_scoped" on public.audit_log
for select to authenticated
using (
  actor_user_id = auth.uid()
  or public.payzik_is_admin()
  or (shop_id is not null and public.payzik_can_manage_shop(shop_id))
);
revoke insert, update, delete on public.audit_log from authenticated, anon;


-- PAYZIK — Migration 3/3 : RPC métier atomiques (SECURITY DEFINER).
-- Chaque fonction vérifie auth.uid() et les autorisations côté base.
-- Tout mouvement monétaire passe par payzik_insert_tx (ledger) et verrouille la ligne.

-- ============================================================
-- INSERTION LEDGER AVEC IDEMPOTENCE
-- ============================================================
create or replace function public.payzik_insert_tx(
  p_client uuid,
  p_shop uuid,
  p_card text,
  p_type text,
  p_amount numeric,
  p_method text,
  p_ref text,
  p_desc text,
  p_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.card_transactions (
    client_id, shop_id, card_id, transaction_type, amount,
    payment_method, status, reference, description, created_by, idempotency_key
  ) values (
    p_client, p_shop, p_card, p_type, p_amount,
    p_method, 'completed', p_ref, p_desc, auth.uid(), p_key
  )
  on conflict (created_by, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.payzik_insert_tx(uuid, uuid, text, text, numeric, text, text, text, text) from public, anon;
grant execute on function public.payzik_insert_tx(uuid, uuid, text, text, numeric, text, text, text, text) to authenticated;

-- ============================================================
-- BOUTIQUES ET AUTORISATIONS
-- ============================================================
create or replace function public.create_shop(p_shop_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_shop_name, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'invalid_shop_name' using errcode = '22023';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;

  -- Le vendeur ne peut pas s'auto-vérifier ni s'auto-affilier au réseau.
  insert into public.shops (owner_user_id, shop_name, verified, in_network, is_active)
  values (auth.uid(), v_name, false, false, true)
  returning id into v_id;

  perform public.payzik_audit(
    'shop_created', v_id, null, 'shop', v_id::text,
    jsonb_build_object('shop_name', v_name)
  );

  return jsonb_build_object('ok', true, 'shop_id', v_id);
end $$;

create or replace function public.admin_set_shop_flags(
  p_shop uuid,
  p_verified boolean,
  p_in_network boolean,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.payzik_is_admin() then
    raise exception 'admin_role_required' using errcode = '42501';
  end if;

  update public.shops
  set verified = p_verified,
      in_network = p_in_network,
      is_active = p_is_active
  where id = p_shop
  returning id into v_id;

  if v_id is null then
    raise exception 'shop_not_found' using errcode = '22023';
  end if;

  perform public.payzik_audit(
    'shop_flags_updated', v_id, null, 'shop', v_id::text,
    jsonb_build_object(
      'verified', p_verified,
      'in_network', p_in_network,
      'is_active', p_is_active
    )
  );

  return jsonb_build_object('ok', true, 'shop_id', v_id);
end $$;

create or replace function public.authorize_shop_user(
  p_shop uuid,
  p_user uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('manager', 'seller', 'viewer') then
    raise exception 'invalid_shop_role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_user) then
    raise exception 'user_not_found' using errcode = '22023';
  end if;

  insert into public.shop_admins (shop_id, user_id, role, is_active)
  values (p_shop, p_user, p_role, true)
  on conflict (shop_id, user_id)
  do update set role = excluded.role, is_active = true
  returning id into v_id;

  perform public.payzik_audit(
    'shop_user_authorized', p_shop, p_user, 'shop_admin', v_id::text,
    jsonb_build_object('role', p_role)
  );

  return jsonb_build_object('ok', true, 'authorization_id', v_id);
end $$;

-- ============================================================
-- LIAGE QR SÉCURISÉ
-- ============================================================
create or replace function public.create_link_token(
  p_shop uuid,
  p_client_id uuid default null,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
  v_hash text;
  v_ttl integer;
  v_expires timestamptz;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  v_ttl := least(greatest(coalesce(p_ttl_seconds, 300), 30), 3600);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
  v_expires := now() + (v_ttl || ' seconds')::interval;

  if p_client_id is not null
     and not exists (
       select 1 from public.profiles pr
       where pr.id = p_client_id and pr.role = 'customer'
     ) then
    raise exception 'invalid_client' using errcode = '22023';
  end if;

  insert into public.link_tokens (shop_id, token_hash, client_id, created_by, expires_at)
  values (p_shop, v_hash, p_client_id, auth.uid(), v_expires)
  returning id into v_id;

  perform public.payzik_audit(
    'link_token_created', p_shop, p_client_id, 'link_token', v_id::text,
    jsonb_build_object('expires_at', v_expires)
  );

  -- Le token brut n'est retourné qu'ici et n'est jamais stocké en clair.
  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'token_id', v_id
  );
end $$;

create or replace function public.confirm_link_token(
  p_token text,
  p_client uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_tok public.link_tokens%rowtype;
  v_client uuid;
  v_active boolean;
  v_link uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  v_client := auth.uid();
  if p_client is not null and p_client <> v_client and not public.payzik_is_admin() then
    raise exception 'client_identity_mismatch' using errcode = '42501';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_tok
  from public.link_tokens lt
  where lt.token_hash = v_hash
  for update;

  if not found or v_tok.used_at is not null or v_tok.expires_at <= now() then
    raise exception 'invalid_or_expired_token' using errcode = '22023';
  end if;
  if v_tok.client_id is not null and v_tok.client_id <> v_client then
    raise exception 'token_not_for_client' using errcode = '42501';
  end if;

  select s.is_active into v_active from public.shops s where s.id = v_tok.shop_id;
  if not coalesce(v_active, false) then
    raise exception 'shop_inactive' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.shop_clients sc
    where sc.shop_id = v_tok.shop_id
      and sc.client_id = v_client
      and sc.status = 'blocked'
  ) then
    raise exception 'relationship_blocked' using errcode = '42501';
  end if;

  update public.link_tokens set used_at = now() where id = v_tok.id;

  insert into public.shop_clients (shop_id, client_id, linked_by, status, linked_at)
  values (v_tok.shop_id, v_client, v_tok.created_by, 'active', now())
  on conflict (shop_id, client_id)
  do update set status = 'active', linked_at = now(), linked_by = excluded.linked_by
  returning id into v_link;

  perform public.payzik_audit(
    'shop_client_linked', v_tok.shop_id, v_client, 'shop_client', v_link::text,
    jsonb_build_object('token_id', v_tok.id)
  );

  return jsonb_build_object(
    'ok', true,
    'shop_id', v_tok.shop_id,
    'client_id', v_client,
    'status', 'active'
  );
end $$;

create or replace function public.set_shop_client_status(
  p_shop uuid,
  p_client uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'active', 'blocked') then
    raise exception 'invalid_relationship_status' using errcode = '22023';
  end if;

  update public.shop_clients
  set status = p_status
  where shop_id = p_shop and client_id = p_client
  returning id into v_id;

  if v_id is null then
    raise exception 'relationship_not_found' using errcode = '22023';
  end if;

  perform public.payzik_audit(
    'shop_client_status_changed', p_shop, p_client, 'shop_client', v_id::text,
    jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('ok', true, 'relationship_id', v_id, 'status', p_status);
end $$;

-- ============================================================
-- CRÉATION DE CARTES
-- ============================================================
create or replace function public.create_shop_card(
  p_shop uuid,
  p_client uuid,
  p_name text,
  p_initial numeric default 0,
  p_funding_method text default 'cash',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id text;
  v_code text;
  v_balance numeric := coalesce(p_initial, 0);
  v_tx uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles pr
    where pr.id = p_client and pr.role = 'customer'
  ) then
    raise exception 'invalid_client' using errcode = '22023';
  end if;
  if not public.payzik_is_linked_client(p_shop, p_client) then
    raise exception 'relationship_required' using errcode = '42501';
  end if;
  if v_balance < 0 or v_balance > 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_funding_method is null or p_funding_method not in ('cash', 'bank_transfer', 'pos', 'check') then
    raise exception 'invalid_funding_method' using errcode = '22023';
  end if;

  v_code := 'PZK-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12));

  insert into public.cards (
    id, owner_id, code, name, balance_dh, card_type, shop_id, status,
    created_by, idempotency_key
  ) values (
    'card-' || gen_random_uuid()::text,
    p_client, v_code, coalesce(nullif(btrim(p_name), ''), 'Carte boutique'),
    0, 'shop', p_shop, 'active', auth.uid(), p_idempotency_key
  )
  on conflict (created_by, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select c.id, c.code, c.balance_dh into v_id, v_code, v_balance
    from public.cards c
    where c.created_by = auth.uid() and c.idempotency_key = p_idempotency_key;

    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'card_id', v_id, 'code', v_code, 'balance_dh', v_balance
    );
  end if;

  if v_balance > 0 then
    v_tx := public.payzik_insert_tx(
      p_client, p_shop, v_id, 'shop_card_recharge', v_balance,
      p_funding_method, null, 'Recharge initiale carte boutique',
      case when p_idempotency_key is null then null else p_idempotency_key || '-initial' end
    );
    update public.cards
    set balance_dh = balance_dh + v_balance
    where id = v_id;
  end if;

  perform public.payzik_audit(
    'shop_card_created', p_shop, p_client, 'card', v_id,
    jsonb_build_object('initial_dh', v_balance, 'code', v_code)
  );

  return jsonb_build_object(
    'ok', true, 'card_id', v_id, 'code', v_code,
    'balance_dh', v_balance, 'transaction_id', v_tx
  );
end $$;

create or replace function public.create_general_card(
  p_name text,
  p_client uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_client uuid;
  v_id text;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  v_client := coalesce(p_client, auth.uid());
  if v_client <> auth.uid() and not public.payzik_is_admin() then
    raise exception 'client_identity_mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles pr
    where pr.id = v_client and pr.role = 'customer'
  ) then
    raise exception 'invalid_client' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.cards c
    where c.owner_id = v_client
      and c.card_type = 'general'
      and c.status = 'active'
  ) then
    raise exception 'active_general_card_exists' using errcode = '23505';
  end if;

  v_code := 'PZK-G-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 12));

  insert into public.cards (
    id, owner_id, code, name, balance_dh, card_type, shop_id, status,
    created_by, idempotency_key
  ) values (
    'card-' || gen_random_uuid()::text,
    v_client, v_code, coalesce(nullif(btrim(p_name), ''), 'Carte PAYZIK'),
    0, 'general', null, 'active', auth.uid(), p_idempotency_key
  )
  on conflict (created_by, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select c.id, c.code into v_id, v_code
    from public.cards c
    where c.created_by = auth.uid() and c.idempotency_key = p_idempotency_key;

    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'card_id', v_id, 'code', v_code
    );
  end if;

  perform public.payzik_audit(
    'general_card_created', null, v_client, 'card', v_id,
    jsonb_build_object('code', v_code)
  );

  return jsonb_build_object('ok', true, 'card_id', v_id, 'code', v_code, 'balance_dh', 0);
end $$;

-- ============================================================
-- RECHARGES
-- ============================================================
create or replace function public.recharge_shop_card(
  p_card text,
  p_amount numeric,
  p_funding_method text,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'shop' or v_card.shop_id is null then
    raise exception 'not_shop_card' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(v_card.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if v_card.status <> 'active' then
    raise exception 'card_blocked' using errcode = '42501';
  end if;
  if not public.payzik_is_linked_client(v_card.shop_id, v_card.owner_id) then
    raise exception 'relationship_required' using errcode = '42501';
  end if;
  if p_funding_method is null or p_funding_method not in ('cash', 'bank_transfer', 'pos', 'check') then
    raise exception 'invalid_funding_method' using errcode = '22023';
  end if;

  v_tx := public.payzik_insert_tx(
    v_card.owner_id, v_card.shop_id, p_card, 'shop_card_recharge', p_amount,
    p_funding_method, p_reference, 'Recharge carte boutique', p_idempotency_key
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid() and ct.idempotency_key = p_idempotency_key;
    select c.balance_dh into v_balance from public.cards c where c.id = p_card;

    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'transaction_id', v_tx, 'balance_dh', v_balance
    );
  end if;

  update public.cards
  set balance_dh = balance_dh + p_amount
  where id = p_card
  returning balance_dh into v_balance;

  perform public.payzik_audit(
    'shop_card_recharged', v_card.shop_id, v_card.owner_id, 'card', p_card,
    jsonb_build_object('transaction_id', v_tx, 'amount_dh', p_amount)
  );

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx, 'balance_dh', v_balance
  );
end $$;

create or replace function public.recharge_general_card(
  p_card text,
  p_amount numeric,
  p_funding_method text,
  p_shop uuid default null,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  if not public.payzik_is_admin() then
    if not public.payzik_role('merchant') or p_shop is null
       or not public.payzik_can_manage_shop(p_shop) then
      raise exception 'recharge_forbidden' using errcode = '42501';
    end if;
  elsif p_shop is not null and not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  if p_funding_method is null or p_funding_method not in ('cash', 'bank_transfer', 'pos', 'check') then
    raise exception 'invalid_funding_method' using errcode = '22023';
  end if;

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'general' then
    raise exception 'not_general_card' using errcode = '22023';
  end if;
  if v_card.status <> 'active' or v_card.owner_id is null then
    raise exception 'card_invalid' using errcode = '42501';
  end if;

  v_tx := public.payzik_insert_tx(
    v_card.owner_id, p_shop, p_card, 'general_card_recharge', p_amount,
    p_funding_method, p_reference, 'Recharge carte générale (espèces reçues)',
    p_idempotency_key
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid() and ct.idempotency_key = p_idempotency_key;
    select c.balance_dh into v_balance from public.cards c where c.id = p_card;

    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'transaction_id', v_tx, 'balance_dh', v_balance
    );
  end if;

  update public.cards
  set balance_dh = balance_dh + p_amount
  where id = p_card
  returning balance_dh into v_balance;

  perform public.payzik_audit(
    'general_card_recharged', p_shop, v_card.owner_id, 'card', p_card,
    jsonb_build_object(
      'transaction_id', v_tx,
      'amount_dh', p_amount,
      'funding_method', p_funding_method,
      'cash_received_by', auth.uid()
    )
  );

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx, 'balance_dh', v_balance
  );
end $$;

-- ============================================================
-- PAIEMENTS ATOMIQUES
-- ============================================================
create or replace function public.pay_shop_card(
  p_card text,
  p_amount numeric,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'shop' or v_card.shop_id is null then
    raise exception 'not_shop_card' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(v_card.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if v_card.status <> 'active' then
    raise exception 'card_blocked' using errcode = '42501';
  end if;
  if not public.payzik_is_linked_client(v_card.shop_id, v_card.owner_id) then
    raise exception 'relationship_required' using errcode = '42501';
  end if;
  if v_card.balance_dh < p_amount then
    raise exception 'insufficient_funds' using errcode = '22023';
  end if;

  v_tx := public.payzik_insert_tx(
    v_card.owner_id, v_card.shop_id, p_card, 'shop_card_payment', p_amount,
    'card', p_reference, 'Paiement carte boutique', p_idempotency_key
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid() and ct.idempotency_key = p_idempotency_key;
    select c.balance_dh into v_balance from public.cards c where c.id = p_card;

    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'transaction_id', v_tx, 'balance_dh', v_balance
    );
  end if;

  update public.cards
  set balance_dh = balance_dh - p_amount
  where id = p_card and balance_dh >= p_amount
  returning balance_dh into v_balance;

  if v_balance is null then
    raise exception 'insufficient_funds' using errcode = '22023';
  end if;

  perform public.payzik_audit(
    'shop_card_payment', v_card.shop_id, v_card.owner_id, 'card', p_card,
    jsonb_build_object('transaction_id', v_tx, 'amount_dh', p_amount)
  );

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx,
    'balance_dh', v_balance, 'status', 'completed'
  );
end $$;

create or replace function public.pay_general_card(
  p_card text,
  p_shop uuid,
  p_amount numeric,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  -- Vérification réseau au moment du paiement, pas seulement à l'affichage.
  if not public.payzik_eligible_shop(p_shop) then
    raise exception 'shop_not_network_eligible' using errcode = '42501';
  end if;

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'general' then
    raise exception 'not_general_card' using errcode = '22023';
  end if;
  if v_card.status <> 'active' or v_card.owner_id is null then
    raise exception 'card_invalid' using errcode = '42501';
  end if;
  if v_card.balance_dh < p_amount then
    raise exception 'insufficient_funds' using errcode = '22023';
  end if;

  v_tx := public.payzik_insert_tx(
    v_card.owner_id, p_shop, p_card, 'general_card_payment', p_amount,
    'card', p_reference, 'Paiement carte générale réseau', p_idempotency_key
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid() and ct.idempotency_key = p_idempotency_key;
    select c.balance_dh into v_balance from public.cards c where c.id = p_card;

    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'transaction_id', v_tx, 'balance_dh', v_balance
    );
  end if;

  -- Contrepartie côté boutique : créance exigible du réseau.
  insert into public.shop_ledger (shop_id, transaction_id, direction, amount, description)
  values (p_shop, v_tx, 'credit', p_amount, 'Règlement carte générale PAYZIK');

  update public.cards
  set balance_dh = balance_dh - p_amount
  where id = p_card and balance_dh >= p_amount
  returning balance_dh into v_balance;

  if v_balance is null then
    raise exception 'insufficient_funds' using errcode = '22023';
  end if;

  perform public.payzik_audit(
    'general_card_payment', p_shop, v_card.owner_id, 'card', p_card,
    jsonb_build_object('transaction_id', v_tx, 'amount_dh', p_amount)
  );

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx,
    'balance_dh', v_balance, 'status', 'completed'
  );
end $$;

-- ============================================================
-- CRÉDIT / REMBOURSEMENT
-- ============================================================
create or replace function public.record_credit_sale(
  p_shop uuid,
  p_client uuid,
  p_lines jsonb,
  p_total numeric,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_tx uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if not public.payzik_is_linked_client(p_shop, p_client) then
    raise exception 'relationship_required' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_total);
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_lines' using errcode = '22023';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.credit_sales cs
    where cs.shop_id = p_shop and cs.idempotency_key = p_idempotency_key
  ) then
    select cs.id into v_id
    from public.credit_sales cs
    where cs.shop_id = p_shop and cs.idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'sale_id', v_id);
  end if;

  insert into public.credit_sales (
    shop_id, client_id, seller_user_id, reference, lines, total_dh, idempotency_key
  ) values (
    p_shop, p_client, auth.uid(), p_reference, coalesce(p_lines, '[]'::jsonb),
    p_total, p_idempotency_key
  )
  returning id into v_id;

  v_tx := public.payzik_insert_tx(
    p_client, p_shop, null, 'credit_sale', p_total, 'credit', p_reference,
    'Vente à crédit enregistrée', p_idempotency_key
  );

  perform public.payzik_audit(
    'credit_sale_recorded', p_shop, p_client, 'credit_sale', v_id::text,
    jsonb_build_object('transaction_id', v_tx, 'total_dh', p_total)
  );

  return jsonb_build_object(
    'ok', true, 'sale_id', v_id, 'transaction_id', v_tx
  );
end $$;

create or replace function public.record_repayment(
  p_shop uuid,
  p_client uuid,
  p_amount numeric,
  p_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_sales numeric;
  v_paid numeric;
  v_id uuid;
  v_tx uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if not public.payzik_is_linked_client(p_shop, p_client) then
    raise exception 'relationship_required' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  select coalesce(sum(total_dh), 0) into v_sales
  from public.credit_sales
  where shop_id = p_shop and client_id = p_client;

  select coalesce(sum(amount_dh), 0) into v_paid
  from public.credit_repayments
  where shop_id = p_shop and client_id = p_client;

  if v_sales - v_paid < p_amount then
    raise exception 'repayment_exceeds_debt' using errcode = '22023';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.credit_repayments cr
    where cr.shop_id = p_shop and cr.idempotency_key = p_idempotency_key
  ) then
    select cr.id into v_id
    from public.credit_repayments cr
    where cr.shop_id = p_shop and cr.idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'repayment_id', v_id);
  end if;

  insert into public.credit_repayments (
    shop_id, client_id, amount_dh, recorded_by, reference, idempotency_key
  ) values (
    p_shop, p_client, p_amount, auth.uid(), p_reference, p_idempotency_key
  )
  returning id into v_id;

  v_tx := public.payzik_insert_tx(
    p_client, p_shop, null, 'repayment', p_amount, 'cash', p_reference,
    'Remboursement kridi', p_idempotency_key
  );

  perform public.payzik_audit(
    'repayment_recorded', p_shop, p_client, 'credit_repayment', v_id::text,
    jsonb_build_object('transaction_id', v_tx, 'amount_dh', p_amount)
  );

  return jsonb_build_object(
    'ok', true, 'repayment_id', v_id, 'transaction_id', v_tx
  );
end $$;

-- ============================================================
-- REVERSAL / REFUND / AJUSTEMENT ADMIN
-- ============================================================
create or replace function public.refund_transaction(
  p_transaction uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tx public.card_transactions%rowtype;
  v_refund uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_tx
  from public.card_transactions ct
  where ct.id = p_transaction
  for update;

  if not found then
    raise exception 'transaction_not_found' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(v_tx.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if v_tx.status <> 'completed' then
    raise exception 'transaction_not_refundable' using errcode = '22023';
  end if;
  if v_tx.transaction_type not in (
    'shop_card_payment', 'general_card_payment',
    'shop_card_recharge', 'general_card_recharge'
  ) then
    raise exception 'transaction_type_not_refundable' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.card_transactions ct
    where ct.transaction_type = 'refund' and ct.reference = p_transaction::text
  ) then
    raise exception 'already_refunded' using errcode = '22023';
  end if;

  v_refund := public.payzik_insert_tx(
    v_tx.client_id, v_tx.shop_id, v_tx.card_id, 'refund', v_tx.amount,
    v_tx.payment_method, p_transaction::text,
    coalesce(nullif(btrim(p_reason), ''), 'Remboursement'),
    'refund:' || p_transaction::text
  );

  if v_refund is null then
    raise exception 'already_refunded' using errcode = '22023';
  end if;

  if v_tx.transaction_type in ('shop_card_payment', 'general_card_payment') then
    update public.cards
    set balance_dh = balance_dh + v_tx.amount
    where id = v_tx.card_id
    returning balance_dh into v_balance;

    if v_tx.transaction_type = 'general_card_payment' then
      insert into public.shop_ledger (
        shop_id, transaction_id, direction, amount, description
      ) values (
        v_tx.shop_id, v_refund, 'debit', v_tx.amount,
        'Annulation paiement carte générale'
      );
    end if;
  else
    update public.cards
    set balance_dh = balance_dh - v_tx.amount
    where id = v_tx.card_id and balance_dh >= v_tx.amount
    returning balance_dh into v_balance;

    if v_balance is null then
      raise exception 'insufficient_balance_for_reversal' using errcode = '22023';
    end if;
  end if;

  -- On n'écrase pas l'historique : on marque l'original comme reversé.
  update public.card_transactions
  set status = 'reversed'
  where id = p_transaction;

  perform public.payzik_audit(
    'transaction_refunded', v_tx.shop_id, v_tx.client_id,
    'card_transaction', p_transaction::text,
    jsonb_build_object('refund_transaction_id', v_refund, 'reason', p_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'refund_transaction_id', v_refund,
    'original_status', 'reversed',
    'balance_dh', v_balance
  );
end $$;

create or replace function public.admin_adjust_card(
  p_card text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null or not public.payzik_is_admin() then
    raise exception 'admin_role_required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;

  v_tx := public.payzik_insert_tx(
    v_card.owner_id, v_card.shop_id, p_card, 'adjustment', abs(p_amount),
    'admin_adjustment', null, p_reason, p_idempotency_key
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid() and ct.idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'transaction_id', v_tx);
  end if;

  update public.cards
  set balance_dh = balance_dh + p_amount
  where id = p_card and balance_dh + p_amount >= 0
  returning balance_dh into v_balance;

  if v_balance is null then
    raise exception 'negative_balance_not_allowed' using errcode = '22023';
  end if;

  perform public.payzik_audit(
    'card_balance_adjusted', v_card.shop_id, v_card.owner_id, 'card', p_card,
    jsonb_build_object('transaction_id', v_tx, 'delta_dh', p_amount)
  );

  return jsonb_build_object(
    'ok', true, 'transaction_id', v_tx, 'balance_dh', v_balance
  );
end $$;

create or replace function public.set_card_status(
  p_card text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'blocked') then
    raise exception 'invalid_card_status' using errcode = '22023';
  end if;

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if not (
    public.payzik_is_admin()
    or v_card.owner_id = auth.uid()
    or (v_card.shop_id is not null and public.payzik_can_manage_shop(v_card.shop_id))
  ) then
    raise exception 'card_forbidden' using errcode = '42501';
  end if;

  update public.cards set status = p_status where id = p_card;

  perform public.payzik_audit(
    'card_status_changed', v_card.shop_id, v_card.owner_id, 'card', p_card,
    jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('ok', true, 'card_id', p_card, 'status', p_status);
end $$;

-- ============================================================
-- LISTE RÉSEAU (RLS INVOKER : respects les politiques de lecture)
-- ============================================================
create or replace function public.get_network_shops()
returns setof public.shops
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select s.*
  from public.shops s
  where s.verified and s.in_network and s.is_active
  order by s.shop_name;
$$;

-- ============================================================
-- GRANTS : exécution uniquement aux utilisateurs authentifiés.
-- ============================================================
revoke all on function public.create_shop(text) from public, anon;
revoke all on function public.admin_set_shop_flags(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.authorize_shop_user(uuid, uuid, text) from public, anon;
revoke all on function public.create_link_token(uuid, uuid, integer) from public, anon;
revoke all on function public.confirm_link_token(text, uuid) from public, anon;
revoke all on function public.set_shop_client_status(uuid, uuid, text) from public, anon;
revoke all on function public.create_shop_card(uuid, uuid, text, numeric, text, text) from public, anon;
revoke all on function public.create_general_card(text, uuid, text) from public, anon;
revoke all on function public.recharge_shop_card(text, numeric, text, text, text) from public, anon;
revoke all on function public.recharge_general_card(text, numeric, text, uuid, text, text) from public, anon;
revoke all on function public.pay_shop_card(text, numeric, text, text) from public, anon;
revoke all on function public.pay_general_card(text, uuid, numeric, text, text) from public, anon;
revoke all on function public.record_credit_sale(uuid, uuid, jsonb, numeric, text, text) from public, anon;
revoke all on function public.record_repayment(uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.refund_transaction(uuid, text) from public, anon;
revoke all on function public.admin_adjust_card(text, numeric, text, text) from public, anon;
revoke all on function public.set_card_status(text, text) from public, anon;
revoke all on function public.get_network_shops() from public, anon;

grant execute on function public.create_shop(text) to authenticated;
grant execute on function public.admin_set_shop_flags(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.authorize_shop_user(uuid, uuid, text) to authenticated;
grant execute on function public.create_link_token(uuid, uuid, integer) to authenticated;
grant execute on function public.confirm_link_token(text, uuid) to authenticated;
grant execute on function public.set_shop_client_status(uuid, uuid, text) to authenticated;
grant execute on function public.create_shop_card(uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.create_general_card(text, uuid, text) to authenticated;
grant execute on function public.recharge_shop_card(text, numeric, text, text, text) to authenticated;
grant execute on function public.recharge_general_card(text, numeric, text, uuid, text, text) to authenticated;
grant execute on function public.pay_shop_card(text, numeric, text, text) to authenticated;
grant execute on function public.pay_general_card(text, uuid, numeric, text, text) to authenticated;
grant execute on function public.record_credit_sale(uuid, uuid, jsonb, numeric, text, text) to authenticated;
grant execute on function public.record_repayment(uuid, uuid, numeric, text, text) to authenticated;
grant execute on function public.refund_transaction(uuid, text) to authenticated;
grant execute on function public.admin_adjust_card(text, numeric, text, text) to authenticated;
grant execute on function public.set_card_status(text, text) to authenticated;
grant execute on function public.get_network_shops() to authenticated;


-- PAYZIK — Migration 4/4 : demandes de recharge client -> validation commerçant.
-- Non destructif : aucune donnée existante n'est supprimée.

-- ============================================================
-- TABLE DES DEMANDES DE RECHARGE
-- ============================================================
create table if not exists public.recharge_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'validated', 'rejected')),
  created_at timestamptz not null default now(),
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  rejection_reason text
);

create index if not exists recharge_requests_shop_idx
  on public.recharge_requests (shop_id, status, created_at desc);
create index if not exists recharge_requests_client_idx
  on public.recharge_requests (client_id, status, created_at desc);

alter table public.recharge_requests enable row level security;

-- Le client voit ses propres demandes.
drop policy if exists "recharge_requests_select_client" on public.recharge_requests;
create policy "recharge_requests_select_client"
  on public.recharge_requests
  for select to authenticated
  using (client_id = auth.uid());

-- Le commerçant voit les demandes de ses boutiques.
drop policy if exists "recharge_requests_select_shop" on public.recharge_requests;
create policy "recharge_requests_select_shop"
  on public.recharge_requests
  for select to authenticated
  using (public.payzik_can_manage_shop(shop_id));

-- Le client crée une demande pour sa propre carte.
drop policy if exists "recharge_requests_insert_client" on public.recharge_requests;
create policy "recharge_requests_insert_client"
  on public.recharge_requests
  for insert to authenticated
  with check (client_id = auth.uid());

-- Seul le commerçant met à jour (validation/refus) via RPC ; RLS garde la porte fermée.
drop policy if exists "recharge_requests_update_shop" on public.recharge_requests;
create policy "recharge_requests_update_shop"
  on public.recharge_requests
  for update to authenticated
  using (public.payzik_can_manage_shop(shop_id))
  with check (public.payzik_can_manage_shop(shop_id));

-- ============================================================
-- RPC : LE CLIENT DEMANDE UNE RECHARGE
-- ============================================================
create or replace function public.request_shop_card_recharge(
  p_shop uuid,
  p_card text,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
  v_request uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  perform public.payzik_assert_amount(p_amount);

  select * into v_card from public.cards c where c.id = p_card for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'shop' or v_card.shop_id is null then
    raise exception 'not_shop_card' using errcode = '22023';
  end if;
  if v_card.shop_id <> p_shop then
    raise exception 'shop_mismatch' using errcode = '22023';
  end if;
  if v_card.owner_id is distinct from auth.uid() then
    raise exception 'card_not_owned' using errcode = '42501';
  end if;
  if v_card.status <> 'active' then
    raise exception 'card_blocked' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shops s where s.id = p_shop and s.is_active) then
    raise exception 'shop_not_found' using errcode = '22023';
  end if;

  -- Évite les doublons de demandes en attente pour la même carte/boutique.
  if exists (
    select 1 from public.recharge_requests r
    where r.client_id = auth.uid()
      and r.shop_id = p_shop
      and r.card_id = p_card
      and r.status = 'pending'
  ) then
    raise exception 'pending_request_exists' using errcode = '23505';
  end if;

  insert into public.recharge_requests (client_id, shop_id, card_id, amount)
  values (auth.uid(), p_shop, p_card, p_amount)
  returning id into v_request;

  perform public.payzik_audit(
    'recharge_requested', p_shop, auth.uid(), 'card', p_card,
    jsonb_build_object('request_id', v_request, 'amount_dh', p_amount)
  );

  return jsonb_build_object('ok', true, 'request_id', v_request, 'status', 'pending');
end $$;

-- ============================================================
-- RPC : LE COMMERÇANT VALIDE UNE DEMANDE
-- ============================================================
create or replace function public.validate_shop_recharge_request(
  p_request uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_req public.recharge_requests%rowtype;
  v_card public.cards%rowtype;
  v_tx uuid;
  v_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_req from public.recharge_requests r where r.id = p_request for update;
  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(v_req.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  select * into v_card from public.cards c where c.id = v_req.card_id for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.status <> 'active' then
    raise exception 'card_blocked' using errcode = '42501';
  end if;

  -- Lien client <-> boutique (automatique à la validation).
  insert into public.shop_clients (shop_id, client_id, linked_by, status)
  values (v_req.shop_id, v_req.client_id, auth.uid(), 'active')
  on conflict (shop_id, client_id) do update set status = 'active', linked_by = auth.uid();

  -- Transaction financière + crédit du solde.
  v_tx := public.payzik_insert_tx(
    v_req.client_id, v_req.shop_id, v_req.card_id, 'shop_card_recharge', v_req.amount,
    'cash', 'Recharge validée par le commerçant', 'recharge-request-' || v_req.id::text
  );

  if v_tx is null then
    select ct.id into v_tx
    from public.card_transactions ct
    where ct.created_by = auth.uid()
      and ct.idempotency_key = 'recharge-request-' || v_req.id::text;
    select c.balance_dh into v_balance from public.cards c where c.id = v_req.card_id;
  else
    update public.cards
    set balance_dh = balance_dh + v_req.amount
    where id = v_req.card_id
    returning balance_dh into v_balance;
  end if;

  update public.recharge_requests
  set status = 'validated',
      validated_by = auth.uid(),
      validated_at = now()
  where id = p_request;

  perform public.payzik_audit(
    'shop_recharge_validated', v_req.shop_id, v_req.client_id, 'card', v_req.card_id,
    jsonb_build_object('request_id', p_request, 'transaction_id', v_tx, 'amount_dh', v_req.amount)
  );

  return jsonb_build_object(
    'ok', true, 'request_id', p_request, 'transaction_id', v_tx, 'balance_dh', v_balance
  );
end $$;

-- ============================================================
-- RPC : LE COMMERÇANT REFUSE UNE DEMANDE
-- ============================================================
create or replace function public.reject_shop_recharge_request(
  p_request uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_req public.recharge_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_req from public.recharge_requests r where r.id = p_request for update;
  if not found then
    raise exception 'request_not_found' using errcode = '22023';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(v_req.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  update public.recharge_requests
  set status = 'rejected',
      validated_by = auth.uid(),
      validated_at = now(),
      rejection_reason = p_reason
  where id = p_request;

  perform public.payzik_audit(
    'shop_recharge_rejected', v_req.shop_id, v_req.client_id, 'card', v_req.card_id,
    jsonb_build_object('request_id', p_request, 'reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'request_id', p_request, 'status', 'rejected');
end $$;

-- ============================================================
-- DROITS
-- ============================================================
revoke all on function public.request_shop_card_recharge(uuid, text, numeric) from public, anon;
revoke all on function public.validate_shop_recharge_request(uuid) from public, anon;
revoke all on function public.reject_shop_recharge_request(uuid, text) from public, anon;

grant execute on function public.request_shop_card_recharge(uuid, text, numeric) to authenticated;
grant execute on function public.validate_shop_recharge_request(uuid) to authenticated;
grant execute on function public.reject_shop_recharge_request(uuid, text) to authenticated;

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

-- PAYZIK — Migration 6/6 : détails de boutique pour l'inscription commerçant.
-- Non destructif.

alter table public.shops
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists responsible_name text,
  add column if not exists image text;

-- Remplace create_shop pour accepter les détails (rétrocompatible : paramètres optionnels).
drop function if exists public.create_shop(text);
drop function if exists public.create_shop(text, text, text, text, text);

create or replace function public.create_shop(
  p_shop_name text,
  p_city text default null,
  p_address text default null,
  p_phone text default null,
  p_responsible text default null,
  p_image text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_shop_name, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'invalid_shop_name' using errcode = '22023';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;

  insert into public.shops (
    owner_user_id, shop_name, city, address, phone, responsible_name, image,
    verified, in_network, is_active
  ) values (
    auth.uid(), v_name, nullif(btrim(p_city), ''), nullif(btrim(p_address), ''),
    nullif(btrim(p_phone), ''), nullif(btrim(p_responsible), ''), p_image,
    false, false, true
  )
  returning id into v_id;

  perform public.payzik_audit(
    'shop_created', v_id, null, 'shop', v_id::text,
    jsonb_build_object('shop_name', v_name, 'city', p_city)
  );

  return jsonb_build_object('ok', true, 'shop_id', v_id);
end $$;

-- ============================================================
-- RPC : MODIFIER LES DÉTAILS D'UNE BOUTIQUE
-- ============================================================
create or replace function public.update_shop(
  p_shop uuid,
  p_shop_name text default null,
  p_city text default null,
  p_address text default null,
  p_phone text default null,
  p_responsible text default null,
  p_image text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  v_name := nullif(btrim(coalesce(p_shop_name, '')), '');

  update public.shops
  set
    shop_name = coalesce(v_name, shop_name),
    city = case when p_city is null then city else nullif(btrim(p_city), '') end,
    address = case when p_address is null then address else nullif(btrim(p_address), '') end,
    phone = case when p_phone is null then phone else nullif(btrim(p_phone), '') end,
    responsible_name = case when p_responsible is null then responsible_name else nullif(btrim(p_responsible), '') end,
    image = coalesce(p_image, image)
  where id = p_shop;

  perform public.payzik_audit(
    'shop_updated', p_shop, auth.uid(), 'shop', p_shop::text,
    jsonb_build_object('shop_name', v_name)
  );

  return jsonb_build_object('ok', true, 'shop_id', p_shop);
end $$;

revoke all on function public.create_shop(text, text, text, text, text, text) from public, anon;
revoke all on function public.update_shop(uuid, text, text, text, text, text, text) from public, anon;

grant execute on function public.create_shop(text, text, text, text, text, text) to authenticated;
grant execute on function public.update_shop(uuid, text, text, text, text, text, text) to authenticated;

-- PAYZIK — Migration 7/7 : vérification publique d'existence d'un compte.
-- Non destructif. Permet d'afficher « Aucun compte avec cet email » sans exposer les profils.

create or replace function public.payzik_email_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return false;
  end if;

  if exists (select 1 from public.profiles where lower(email) = v_email) then
    return true;
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    return true;
  end if;

  return false;
end $$;

revoke all on function public.payzik_email_exists(text) from public;
grant execute on function public.payzik_email_exists(text) to anon, authenticated;


-- PAYZIK — Migration 8/8 : informations réelles du profil client / responsable.
-- Non destructif.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists responsible_name text;


-- PAYZIK — Migration 9/9 : mise à jour du profil (sans changer le rôle)
-- et photo de profil. Non destructif.

alter table public.profiles
  add column if not exists image text;

create or replace function public.update_profile(
  p_name text default null,
  p_phone text default null,
  p_city text default null,
  p_address text default null,
  p_responsible text default null,
  p_image text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.profiles
  set
    name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    phone = case when p_phone is null then phone else nullif(btrim(p_phone), '') end,
    city = case when p_city is null then city else nullif(btrim(p_city), '') end,
    address = case when p_address is null then address else nullif(btrim(p_address), '') end,
    responsible_name = case when p_responsible is null then responsible_name else nullif(btrim(p_responsible), '') end,
    image = coalesce(p_image, image)
  where id = auth.uid();

  perform public.payzik_audit(
    'profile_updated', auth.uid(), auth.uid(), 'profile', auth.uid()::text,
    jsonb_build_object('name', p_name)
  );

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.update_profile(text, text, text, text, text, text) from public, anon;
grant execute on function public.update_profile(text, text, text, text, text, text) to authenticated;


-- PAYZIK — Migration 10/10 : offres et promotions réelles des boutiques.
-- Non destructif.

create table if not exists public.shop_offers (
  id uuid primary key default extensions.uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null,
  description text,
  discount_label text,
  image text,
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shop_offers enable row level security;

drop policy if exists "shop_offers_select_public" on public.shop_offers;
create policy "shop_offers_select_public" on public.shop_offers
for select to authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

revoke insert, update, delete on public.shop_offers from authenticated, anon;

-- ============================================================
-- RPC : créer une offre (commerçant authentifié, boutique possédée)
-- ============================================================
create or replace function public.create_shop_offer(
  p_shop uuid,
  p_title text,
  p_description text default null,
  p_discount text default null,
  p_image text default null,
  p_ends_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_title = '' then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  insert into public.shop_offers (shop_id, title, description, discount_label, image, ends_at)
  values (p_shop, v_title, nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_discount, '')), ''), p_image, p_ends_at)
  returning id into v_id;

  perform public.payzik_audit(
    'offer_created', v_id, auth.uid(), 'offer', v_id::text, jsonb_build_object('title', v_title)
  );

  return jsonb_build_object('ok', true, 'offer_id', v_id);
end $$;

-- ============================================================
-- RPC : désactiver une offre
-- ============================================================
create or replace function public.disable_shop_offer(p_offer uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shop_offers o
    where o.id = p_offer and public.payzik_can_manage_shop(o.shop_id)
  ) then
    raise exception 'offer_forbidden' using errcode = '42501';
  end if;

  update public.shop_offers set is_active = false where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.create_shop_offer(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.disable_shop_offer(uuid) from public, anon;
grant execute on function public.create_shop_offer(uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.disable_shop_offer(uuid) to authenticated;

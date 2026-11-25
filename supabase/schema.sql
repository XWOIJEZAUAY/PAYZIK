-- PAYZIK — schéma multi-utilisateurs (PostgreSQL / Supabase).
-- Idempotent : peut être ré-exécuté sans erreur.

-- ===================== PROFILS =====================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null check (role in ('merchant', 'customer')),
  premium boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

-- ===================== PRODUITS (par marchand) =====================
create table if not exists public.products (
  id text primary key,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  price_dh numeric not null default 0,
  stock integer not null default 0,
  category text,
  emoji text,
  aliases text[] default '{}',
  image text,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;

drop policy if exists "products_select_all" on public.products;
create policy "products_select_all" on public.products for select to authenticated using (true);
drop policy if exists "products_write_own" on public.products;
create policy "products_write_own" on public.products for all to authenticated using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);

-- ===================== VENTES =====================
create table if not exists public.sales (
  id text primary key,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  ticket_no integer not null,
  lines jsonb not null default '[]'::jsonb,
  total_dh numeric not null default 0,
  method text not null,
  client_name text,
  created_at timestamptz not null default now()
);
alter table public.sales enable row level security;

drop policy if exists "sales_select_own_or_customer" on public.sales;
create policy "sales_select_own_or_customer" on public.sales for select to authenticated using (auth.uid() = merchant_id or auth.uid() = customer_id);
drop policy if exists "sales_insert_merchant" on public.sales;
create policy "sales_insert_merchant" on public.sales for insert to authenticated with check (auth.uid() = merchant_id);

-- ===================== KRIDI (crédit) =====================
create table if not exists public.kridi (
  id text primary key,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  amount_dh numeric not null default 0,
  label text,
  items jsonb,
  created_at timestamptz not null default now()
);
alter table public.kridi enable row level security;

drop policy if exists "kridi_select_own" on public.kridi;
create policy "kridi_select_own" on public.kridi for select to authenticated using (auth.uid() = merchant_id or auth.uid() = customer_id);
drop policy if exists "kridi_insert_merchant" on public.kridi;
create policy "kridi_insert_merchant" on public.kridi for insert to authenticated with check (auth.uid() = merchant_id);

-- ===================== CARTES PAYZIK =====================
create table if not exists public.cards (
  id text primary key,
  owner_id uuid references public.profiles(id) on delete set null,
  code text unique not null,
  name text not null,
  phone text,
  balance_dh numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.cards enable row level security;

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards for insert to authenticated with check (auth.uid() = owner_id);

-- ===================== PREMIUM (mise en avant) =====================
create table if not exists public.promotions (
  id text primary key,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promotions enable row level security;

drop policy if exists "promotions_select_all" on public.promotions;
create policy "promotions_select_all" on public.promotions for select to authenticated using (active = true);
drop policy if exists "promotions_write_own" on public.promotions;
create policy "promotions_write_own" on public.promotions for all to authenticated using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);
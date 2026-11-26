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

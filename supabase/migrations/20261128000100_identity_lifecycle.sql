-- PAYZIK — Migration 13/13 : identité, onboarding, provisioning commerçant,
-- visibilité multi-utilisateurs et durcissement transactionnel.
-- Non destructive : aucune donnée métier n'est supprimée ni réécrite.
-- Exécuter UNE SEULE FOIS dans un environnement de test avant production.
SET lock_timeout = '30s';
SET statement_timeout = '180s';

-- =============================================================
-- 1) ÉTAT D'ONBOARDING PERSISTÉ (source de vérité = PostgreSQL)
-- =============================================================
alter table public.profiles
  add column if not exists onboarding_completed boolean;

-- Backfill déductif : un profil déjà complet (et, pour un commerçant,
-- possesseur d'une boutique active) est considéré comme déjà onboardé.
update public.profiles p
  set onboarding_completed = true
  where p.onboarding_completed is null
    and coalesce(nullif(btrim(p.name), ''), '') <> ''
    and (
      p.role = 'customer'
      or exists (
        select 1 from public.shops s
        where s.owner_user_id = p.id and s.is_active
      )
    );

update public.profiles
  set onboarding_completed = false
  where onboarding_completed is null;

alter table public.profiles
  alter column onboarding_completed set default false,
  alter column onboarding_completed set not null;

-- =============================================================
-- 2) GARDE DE RÔLE CORRECTE
-- current_user est le propriétaire d'une fonction SECURITY DEFINER :
-- il ne doit jamais être utilisé pour identifier l'appelant.
-- =============================================================
create or replace function public.payzik_profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.onboarding_completed := coalesce(new.onboarding_completed, false);
  end if;

  -- Les écritures système (service_role / trigger auth) conservent leur rôle.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is not null
     and new.role not in ('merchant', 'customer', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- Un client ne peut jamais s'auto-promouvoir admin.
  if new.role = 'admin' and not public.payzik_is_admin() then
    raise exception 'admin_role_forbidden' using errcode = '42501';
  end if;

  -- Changement de rôle : autorisé uniquement pendant l'onboarding initial,
  -- par l'utilisateur concerné, ou par un administrateur.
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(old.onboarding_completed, false) then
      if not public.payzik_is_admin() then
        raise exception 'role_change_forbidden' using errcode = '42501';
      end if;
    elsif new.id is distinct from auth.uid() then
      raise exception 'role_change_forbidden' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists payzik_profiles_role_guard on public.profiles;
create trigger payzik_profiles_role_guard
before insert or update on public.profiles
for each row execute function public.payzik_profiles_role_guard();

-- =============================================================
-- 3) COQUE DE PROFIL À LA CRÉATION DU COMPTE AUTH
-- Aucun profil n'est créé côté frontend de manière compétitive.
-- =============================================================
create or replace function public.payzik_create_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email text := coalesce(new.email, new.id::text || '@local.invalid');
  v_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(v_email, '@', 1),
    'Utilisateur'
  );
begin
  begin
    insert into public.profiles (id, email, name, role, premium, onboarding_completed)
    values (new.id, v_email, v_name, 'customer', false, false)
    on conflict (id) do nothing;
  exception
    when unique_violation then
      -- Un email déjà attaché à un autre profil ne doit pas casser l'auth.
      null;
  end;
  return new;
end $$;

drop trigger if exists payzik_create_profile_from_auth on auth.users;
create trigger payzik_create_profile_from_auth
after insert on auth.users
for each row execute function public.payzik_create_profile_from_auth();

-- =============================================================
-- 4) LECTURE CONSOLIDÉE DU PROFIL (une seule source pour le frontend)
-- =============================================================
create or replace function public.payzik_get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_shops jsonb;
  v_needs boolean;
  v_email text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_p from public.profiles where id = v_uid;

  if not found then
    select
      coalesce(u.email, ''),
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
        'Utilisateur'
      )
    into v_email, v_name
    from auth.users u where u.id = v_uid;

    return jsonb_build_object(
      'id', v_uid,
      'email', v_email,
      'name', v_name,
      'role', 'customer',
      'premium', false,
      'needsRole', true,
      'onboarding_completed', false,
      'shops', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.shop_name,
        'city', s.city,
        'address', s.address,
        'phone', s.phone,
        'responsible', s.responsible_name,
        'image', s.image,
        'verified', s.verified,
        'in_network', s.in_network,
        'is_active', s.is_active
      ) order by s.created_at
    ),
    '[]'::jsonb
  )
  into v_shops
  from public.shops s
  where s.owner_user_id = v_uid;

  v_needs :=
    (not coalesce(v_p.onboarding_completed, false))
    or coalesce(nullif(btrim(v_p.name), ''), '') = ''
    or (v_p.role = 'merchant' and jsonb_array_length(v_shops) = 0);

  return jsonb_build_object(
    'id', v_p.id,
    'email', coalesce(v_p.email, ''),
    'name', v_p.name,
    'role', v_p.role,
    'premium', coalesce(v_p.premium, false),
    'phone', v_p.phone,
    'city', v_p.city,
    'address', v_p.address,
    'responsible', v_p.responsible_name,
    'image', v_p.image,
    'needsRole', v_needs,
    'onboarding_completed', coalesce(v_p.onboarding_completed, false),
    'shops', v_shops
  );
end $$;

-- =============================================================
-- 5) ONBOARDING ATOMIQUE + PROVISIONING COMERÇANT IDEMPOTENT
-- =============================================================
create or replace function public.payzik_complete_onboarding(
  p_role text,
  p_name text default null,
  p_phone text default null,
  p_city text default null,
  p_address text default null,
  p_responsible text default null,
  p_image text default null,
  p_shop_name text default null,
  p_shop_city text default null,
  p_shop_address text default null,
  p_shop_phone text default null,
  p_shop_image text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_email text;
  v_shop_id uuid;
  v_shop_name text;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('merchant', 'customer') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select coalesce(u.email, '') into v_email from auth.users u where u.id = v_uid;

  select * into v_p from public.profiles where id = v_uid for update;
  if not found then
    insert into public.profiles (
      id, email, name, role, premium, onboarding_completed,
      phone, city, address, responsible_name, image
    ) values (
      v_uid, v_email,
      coalesce(nullif(btrim(p_name), ''), 'Utilisateur'),
      p_role, false, false,
      nullif(btrim(p_phone), ''), nullif(btrim(p_city), ''),
      nullif(btrim(p_address), ''), nullif(btrim(p_responsible), ''), p_image
    )
    on conflict (id) do nothing;
    select * into v_p from public.profiles where id = v_uid for update;
  end if;

  if coalesce(v_p.onboarding_completed, false) then
    -- Profil terminé : on complète seulement les champs manquants,
    -- jamais le rôle, jamais une valeur déjà persistée.
    update public.profiles
    set
      name = coalesce(nullif(btrim(v_p.name), ''), nullif(btrim(p_name), ''), name),
      phone = coalesce(v_p.phone, nullif(btrim(p_phone), '')),
      city = coalesce(v_p.city, nullif(btrim(p_city), '')),
      address = coalesce(v_p.address, nullif(btrim(p_address), '')),
      responsible_name = coalesce(v_p.responsible_name, nullif(btrim(p_responsible), '')),
      image = coalesce(v_p.image, p_image)
    where id = v_uid;
  else
    -- Premier onboarding : le rôle choisi est légitime et persisté une fois.
    update public.profiles
    set
      role = p_role,
      name = coalesce(nullif(btrim(p_name), ''), nullif(btrim(v_p.name), ''), name),
      phone = coalesce(nullif(btrim(p_phone), ''), v_p.phone),
      city = coalesce(nullif(btrim(p_city), ''), v_p.city),
      address = coalesce(nullif(btrim(p_address), ''), v_p.address),
      responsible_name = coalesce(nullif(btrim(p_responsible), ''), v_p.responsible_name),
      image = coalesce(p_image, v_p.image),
      onboarding_completed = true
    where id = v_uid;
  end if;

  select * into v_p from public.profiles where id = v_uid;

  if v_p.role = 'merchant' then
    v_shop_name := nullif(btrim(coalesce(p_shop_name, v_p.name || ' boutique')), '');
    if v_shop_name is null then
      raise exception 'invalid_shop_name' using errcode = '22023';
    end if;

    select s.id into v_shop_id
    from public.shops s
    where s.owner_user_id = v_uid
      and lower(btrim(s.shop_name)) = lower(v_shop_name)
      and s.is_active
    order by s.created_at asc
    limit 1;

    if v_shop_id is null then
      insert into public.shops (
        owner_user_id, shop_name, city, address, phone, responsible_name, image,
        verified, in_network, is_active
      ) values (
        v_uid, v_shop_name,
        nullif(btrim(p_shop_city), ''), nullif(btrim(p_shop_address), ''),
        nullif(btrim(p_shop_phone), ''), nullif(btrim(p_responsible), ''), p_shop_image,
        false, true, true
      )
      returning id into v_shop_id;
      v_created := true;
    else
      update public.shops
      set
        city = coalesce(city, nullif(btrim(p_shop_city), '')),
        address = coalesce(address, nullif(btrim(p_shop_address), '')),
        phone = coalesce(phone, nullif(btrim(p_shop_phone), '')),
        responsible_name = coalesce(responsible_name, nullif(btrim(p_responsible), '')),
        image = coalesce(image, p_shop_image)
      where id = v_shop_id;
    end if;

    insert into public.shop_admins (shop_id, user_id, role, is_active)
    values (v_shop_id, v_uid, 'manager', true)
    on conflict do nothing;

    perform public.payzik_audit(
      case when v_created then 'shop_created' else 'shop_reused' end,
      v_shop_id, v_uid, 'shop', v_shop_id::text,
      jsonb_build_object('shop_name', v_shop_name)
    );
  end if;

  perform public.payzik_audit(
    'onboarding_completed', null, v_uid, 'profile', v_uid::text,
    jsonb_build_object('role', v_p.role)
  );

  return public.payzik_get_my_profile();
end $$;

revoke all on function public.payzik_get_my_profile() from public, anon;
revoke all on function public.payzik_complete_onboarding(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.payzik_get_my_profile() to authenticated;
grant execute on function public.payzik_complete_onboarding(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- =============================================================
-- 6) create_shop GET-OR-CREATE (plus de boutique doublon au login)
-- Signature conservée : aucun appel frontend à modifier.
-- =============================================================
create or replace function public.create_shop(
  p_shop_name text,
  p_city text default null,
  p_address text default null,
  p_phone text default null,
  p_responsible text default null,
  p_image text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_shop_name, '')), '');
  v_created boolean := false;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'invalid_shop_name' using errcode = '22023';
  end if;
  if not (public.payzik_role('merchant') or public.payzik_is_admin()) then
    raise exception 'seller_role_required' using errcode = '42501';
  end if;

  select s.id into v_id
  from public.shops s
  where s.owner_user_id = auth.uid()
    and lower(btrim(s.shop_name)) = lower(v_name)
    and s.is_active
  order by s.created_at asc
  limit 1;

  if v_id is null then
    insert into public.shops (
      owner_user_id, shop_name, city, address, phone, responsible_name, image,
      verified, in_network, is_active
    ) values (
      auth.uid(), v_name,
      nullif(btrim(p_city), ''), nullif(btrim(p_address), ''),
      nullif(btrim(p_phone), ''), nullif(btrim(p_responsible), ''), p_image,
      false, true, true
    )
    returning id into v_id;
    v_created := true;
  else
    update public.shops
    set
      city = coalesce(city, nullif(btrim(p_city), '')),
      address = coalesce(address, nullif(btrim(p_address), '')),
      phone = coalesce(phone, nullif(btrim(p_phone), '')),
      responsible_name = coalesce(responsible_name, nullif(btrim(p_responsible), '')),
      image = coalesce(image, p_image)
    where id = v_id;
  end if;

  insert into public.shop_admins (shop_id, user_id, role, is_active)
  values (v_id, auth.uid(), 'manager', true)
  on conflict do nothing;

  perform public.payzik_audit(
    case when v_created then 'shop_created' else 'shop_reused' end,
    v_id, auth.uid(), 'shop', v_id::text,
    jsonb_build_object('shop_name', v_name)
  );

  return jsonb_build_object('ok', true, 'shop_id', v_id);
end $$;

-- =============================================================
-- 6b) PUBLICATION DES PRODUITS : LE CATALOGUE CLIENT VIENT DE LA BASE
-- =============================================================
create or replace function public.upsert_shop_product(
  p_id text,
  p_shop uuid,
  p_name text,
  p_price numeric,
  p_stock integer,
  p_category text default null,
  p_emoji text default null,
  p_aliases text[] default '{}',
  p_image text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner uuid;
  v_result_id text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_id is null or btrim(p_id) = '' then
    raise exception 'invalid_product_id' using errcode = '22023';
  end if;
  if p_shop is null or not public.payzik_can_manage_shop(p_shop) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'invalid_stock' using errcode = '22023';
  end if;

  select merchant_id into v_owner from public.products pr where pr.id = p_id;
  if found and v_owner is distinct from auth.uid() then
    raise exception 'product_forbidden' using errcode = '42501';
  end if;

  insert into public.products (
    id, merchant_id, shop_id, name, price_dh, stock,
    category, emoji, aliases, image
  ) values (
    p_id, auth.uid(), p_shop,
    nullif(btrim(coalesce(p_name, '')), ''), p_price, p_stock,
    nullif(btrim(coalesce(p_category, '')), ''), nullif(btrim(coalesce(p_emoji, '')), ''),
    coalesce(p_aliases, '{}'::text[]), p_image
  )
  on conflict (id) do update set
    shop_id = excluded.shop_id,
    name = excluded.name,
    price_dh = excluded.price_dh,
    stock = excluded.stock,
    category = excluded.category,
    emoji = excluded.emoji,
    aliases = excluded.aliases,
    image = excluded.image
  returning id into v_result_id;

  perform public.payzik_audit(
    'product_published', p_shop, auth.uid(), 'product', v_result_id,
    jsonb_build_object('name', p_name, 'price_dh', p_price, 'stock', p_stock)
  );

  return jsonb_build_object('ok', true, 'id', v_result_id);
end $$;

create or replace function public.delete_shop_product(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pr public.products%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select * into v_pr from public.products pr where pr.id = p_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'id', p_id);
  end if;
  if v_pr.merchant_id is distinct from auth.uid() then
    raise exception 'product_forbidden' using errcode = '42501';
  end if;
  if v_pr.shop_id is not null and not public.payzik_can_manage_shop(v_pr.shop_id) then
    raise exception 'shop_forbidden' using errcode = '42501';
  end if;

  delete from public.products pr where pr.id = p_id;

  perform public.payzik_audit(
    'product_unpublished', v_pr.shop_id, auth.uid(), 'product', p_id,
    jsonb_build_object('name', v_pr.name)
  );

  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

revoke all on function public.upsert_shop_product(text, uuid, text, numeric, integer, text, text, text[], text) from public, anon;
revoke all on function public.delete_shop_product(text) from public, anon;
grant execute on function public.upsert_shop_product(text, uuid, text, numeric, integer, text, text, text[], text) to authenticated;
grant execute on function public.delete_shop_product(text) to authenticated;

-- =============================================================
-- 7) DÉCOUVERTE MULTI-UTILISATEUR SANS EXPOSER LES DONNÉES PRIVÉES
-- =============================================================
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "products_select_all" on public.products;
drop policy if exists "sales_select_own_or_customer" on public.sales;
drop policy if exists "kridi_select_own" on public.kridi;
drop policy if exists "cards_select_own" on public.cards;
drop policy if exists "cards_insert_own" on public.cards;
drop policy if exists "promotions_select_all" on public.promotions;
drop policy if exists "promotions_write_own" on public.promotions;

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (
  id = auth.uid()
  and role in ('merchant', 'customer')
  and coalesce(onboarding_completed, false) = false
);

drop policy if exists "shops_select_scoped" on public.shops;
create policy "shops_select_scoped" on public.shops
for select to authenticated
using (
  owner_user_id = auth.uid()
  or public.payzik_is_admin()
  or public.payzik_can_manage_shop(id)
  or (in_network and is_active)
);

-- =============================================================
-- 8) SÉCURITÉ DES ÉCRITURES BOUTIQUE
-- =============================================================
create or replace function public.payzik_is_shop_manager(p_shop uuid)
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
          and a.role = 'manager'
      )
    );
$$;

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
  if not public.payzik_is_shop_manager(p_shop) then
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

-- =============================================================
-- 9) LEDGER : UNE CLÉ D'IDEMPOTENCE = UNE SEULE OPÉRATION
-- Une collision avec une opération différente lève une erreur au lieu
-- de retourner silencieusement "duplicate" (paiement gratuit / crédit sans ledger).
-- =============================================================
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
  v_existing public.card_transactions%rowtype;
begin
  begin
    insert into public.card_transactions (
      client_id, shop_id, card_id, transaction_type, amount,
      payment_method, status, reference, description, created_by, idempotency_key
    ) values (
      p_client, p_shop, p_card, p_type, p_amount,
      p_method, 'completed', p_ref, p_desc, auth.uid(), p_key
    )
    returning id into v_id;
  exception
    when unique_violation then
      select * into v_existing
      from public.card_transactions ct
      where ct.created_by = auth.uid()
        and ct.idempotency_key = p_key;

      if not found then
        raise;
      end if;

      if v_existing.client_id is distinct from p_client
         or v_existing.shop_id is distinct from p_shop
         or v_existing.card_id is distinct from p_card
         or v_existing.transaction_type is distinct from p_type
         or v_existing.amount is distinct from p_amount
         or v_existing.reference is distinct from p_ref
      then
        raise exception 'idempotency_key_reuse' using errcode = '22023';
      end if;

      v_id := v_existing.id;
  end;

  return v_id;
end $$;

-- =============================================================
-- 10) RECHARGES : PLUS D'INSERT/UPDATE DIRECT CÔTÉ CLIENT
-- =============================================================
revoke insert, update, delete on public.recharge_requests from authenticated, anon;

create or replace function public.recharge_requests_insert_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_card public.cards%rowtype;
begin
  perform public.payzik_assert_amount(new.amount);

  select * into v_card from public.cards c where c.id = new.card_id;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.card_type <> 'shop'
     or v_card.shop_id is distinct from new.shop_id
     or v_card.owner_id is distinct from new.client_id
  then
    raise exception 'card_request_mismatch' using errcode = '42501';
  end if;
  if coalesce(new.status, 'pending') <> 'pending' then
    raise exception 'request_status_must_be_pending' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists recharge_requests_insert_integrity on public.recharge_requests;
create trigger recharge_requests_insert_integrity
before insert on public.recharge_requests
for each row execute function public.recharge_requests_insert_integrity();

create or replace function public.validate_shop_recharge_request(
  p_request uuid
)
returns jsonb
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
  perform public.payzik_assert_amount(v_req.amount);

  if not exists (
    select 1 from public.shops s where s.id = v_req.shop_id and s.is_active
  ) then
    raise exception 'shop_inactive' using errcode = '42501';
  end if;

  select * into v_card from public.cards c where c.id = v_req.card_id for update;
  if not found then
    raise exception 'card_not_found' using errcode = '22023';
  end if;
  if v_card.status <> 'active' then
    raise exception 'card_blocked' using errcode = '42501';
  end if;
  if v_card.card_type <> 'shop'
     or v_card.shop_id is distinct from v_req.shop_id
     or v_card.owner_id is distinct from v_req.client_id
  then
    raise exception 'card_request_mismatch' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.shop_clients sc
    where sc.shop_id = v_req.shop_id
      and sc.client_id = v_req.client_id
      and sc.status = 'blocked'
  ) then
    raise exception 'client_relation_blocked' using errcode = '42501';
  end if;

  insert into public.shop_clients (shop_id, client_id, linked_by, status)
  values (v_req.shop_id, v_req.client_id, auth.uid(), 'active')
  on conflict (shop_id, client_id)
  do update set status = 'active', linked_by = auth.uid();

  v_tx := public.payzik_insert_tx(
    v_req.client_id, v_req.shop_id, v_req.card_id, 'shop_card_recharge', v_req.amount,
    'cash', 'Recharge validée par le commerçant', 'recharge-request-' || v_req.id::text
  );

  if v_tx is null then
    raise exception 'ledger_write_failed' using errcode = '40001';
  end if;

  update public.cards
  set balance_dh = balance_dh + v_req.amount
  where id = v_req.card_id
  returning balance_dh into v_balance;

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

-- =============================================================
-- 11) REALTIME : LES TABLES QUE L'UI ÉCOUTE DOIVENT ÊTRE PUBLIÉES
-- =============================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['products', 'cards'] loop
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

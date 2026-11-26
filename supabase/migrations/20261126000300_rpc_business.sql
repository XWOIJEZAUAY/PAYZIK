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

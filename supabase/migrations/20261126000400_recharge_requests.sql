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
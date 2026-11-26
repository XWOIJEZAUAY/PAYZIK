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
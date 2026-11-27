-- PAYZIK — Migration 11/11 : catalogue public + commandes de préparation IA.
-- Non destructif. Exécuter UNE SEULE FOIS, sans autre requête concurrente.
SET lock_timeout = '30s';
SET statement_timeout = '120s';

-- 1) Les clients peuvent voir les produits des boutiques réelles du réseau.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products
for select to authenticated
using (
  exists (
    select 1 from public.shops s
    where s.id = shop_id
      and s.is_active = true
      and s.in_network = true
  )
);

-- 2) Commandes de préparation.
create table if not exists public.prep_orders (
  id uuid primary key default extensions.uuid_generate_v4(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'ready', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.prep_orders enable row level security;

drop policy if exists "prep_orders_select_scoped" on public.prep_orders;
create policy "prep_orders_select_scoped" on public.prep_orders
for select to authenticated
using (
  client_id = auth.uid()
  or public.payzik_can_manage_shop(shop_id)
  or public.payzik_is_admin()
);

revoke insert, update, delete on public.prep_orders from authenticated, anon;

-- 3) RPC : créer une commande (client).
create or replace function public.create_prep_order(
  p_shop uuid,
  p_items jsonb,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.shops s
    where s.id = p_shop and s.is_active = true
  ) then
    raise exception 'shop_unavailable' using errcode = '22023';
  end if;

  select count(*) into v_count
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x
  where coalesce((x.value->>'qty')::int, 0) > 0;

  if v_count = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;

  insert into public.prep_orders (client_id, shop_id, items, note)
  values (auth.uid(), p_shop, p_items, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  perform public.payzik_audit(
    'prep_order_created', p_shop, auth.uid(), 'prep_order', v_id::text,
    jsonb_build_object('shop_id', p_shop, 'items', p_items)
  );

  return jsonb_build_object('ok', true, 'order_id', v_id);
end $$;

-- 4) RPC : le commerçant confirme la préparation.
create or replace function public.confirm_prep_order(
  p_order uuid,
  p_status text default 'confirmed'
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_status text := coalesce(p_status, 'confirmed');
  v_shop uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_status not in ('confirmed', 'ready', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.prep_orders o
    where o.id = p_order and public.payzik_can_manage_shop(o.shop_id)
  ) then
    raise exception 'order_forbidden' using errcode = '42501';
  end if;

  select shop_id into v_shop from public.prep_orders where id = p_order;

  update public.prep_orders
  set status = v_status,
      confirmed_at = coalesce(confirmed_at, now())
  where id = p_order;

  perform public.payzik_audit(
    'prep_order_updated', v_shop, auth.uid(), 'prep_order', p_order::text,
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.create_prep_order(uuid, jsonb, text) from public, anon;
revoke all on function public.confirm_prep_order(uuid, text) from public, anon;
grant execute on function public.create_prep_order(uuid, jsonb, text) to authenticated;
grant execute on function public.confirm_prep_order(uuid, text) to authenticated;

-- 5) Temps réel.
do $$
begin
  alter publication supabase_realtime add table public.prep_orders;
exception when duplicate_object then null;
end $$;

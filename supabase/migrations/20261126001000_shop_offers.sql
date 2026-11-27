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

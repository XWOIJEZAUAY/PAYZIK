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

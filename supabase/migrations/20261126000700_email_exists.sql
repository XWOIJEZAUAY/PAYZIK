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

-- PAYZIK — Migration 8/8 : informations réelles du profil client / responsable.
-- Non destructif.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists responsible_name text;

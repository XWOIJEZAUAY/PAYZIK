# Migrations backend PAYZIK

Appliquer dans cet ordre sur le projet Supabase (CLI ou SQL Editor avec un compte autorisé) :

1. `supabase/schema.sql` — socle historique (uniquement si la base ne l'a pas déjà).
   Ce fichier ne définit plus aucun policy RLS : les politiques vivent dans les migrations.
2. `20261126000100_core_tables.sql` — boutiques, relations, tokens, cartes, ledger, crédit, audit.
3. `20261126000200_rls_policies.sql` — fonctions d'autorisation et politiques RLS strictes.
4. `20261126000300_rpc_business.sql` — RPC atomiques et grants.
5. `20261126000400_recharge_requests.sql` — demandes de recharge boutique.
6. `20261126000500_realtime_recharge_requests.sql` — publication Realtime des recharges.
7. `20261126000600_shop_details.sql` — détails boutique, `create_shop`, `update_shop`.
8. `20261126000700_email_exists.sql` — vérification d'email.
9. `20261126000800_profile_details.sql` — coordonnées du profil.
10. `20261126000900_update_profile.sql` — RPC `update_profile` et photo de profil.
11. `20261126001000_shop_offers.sql` — offres boutique.
12. `20261126001100_prep_orders.sql` — catalogue public et commandes de préparation.
13. `20261127000100_partner_ads.sql` — publicités partenaires.
14. `20261128000100_identity_lifecycle.sql` — identité, onboarding persistant,
    provisioning marchand idempotent, publication produits en base, durcissement
    RLS/ledger, Realtime produits/cartes.

`supabase/APPLY_ALL.sql` est la concaténation exécutable de ces migrations (hors `schema.sql`).
Sur une base déjà migrée, ne jamais ré-exécuter `schema.sql`.

Les migrations sont idempotentes et non destructives. Elles n'écrivent ni ne suppriment aucune donnée
métier existante. Les cartes historiques sans `shop_id` restent inutilisables en paiement tant qu'elles
n'ont pas été migrées manuellement vers une boutique (volontaire : aucune affectation arbitraire n'est inventée).

## Application

```bash
# Avec le CLI Supabase et Docker disponibles
supabase db push

# Ou, pour un projet hébergé, coller APPLY_ALL.sql dans le SQL Editor
# puis exécuter les tests :
npm run test:backend
```

Les tests nécessitent `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`
(voir `.env.example`). Le service-role sert uniquement à créer les identités isolées de test.

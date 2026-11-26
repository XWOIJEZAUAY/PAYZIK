# Migrations backend PAYZIK

Appliquer dans cet ordre sur le projet Supabase (CLI ou SQL Editor avec un compte autorisé) :

1. `supabase/schema.sql` — socle historique (si la base ne l'a pas déjà).
2. `20261126000100_core_tables.sql` — boutiques, relations, tokens, cartes, ledger, crédit, audit.
3. `20261126000200_rls_policies.sql` — fonctions d'autorisation et politiques RLS strictes.
4. `20261126000300_rpc_business.sql` — RPC atomiques et grants.

Les migrations sont idempotentes et non destructives. Elles n'écrivent ni ne suppriment aucune donnée
métier existante. Les cartes historiques sans `shop_id` restent inutilisables en paiement tant qu'elles
n'ont pas été migrées manuellement vers une boutique (volontaire : aucune affectation arbitraire n'est inventée).

Vérification locale : les quatre fichiers SQL passent `pgsql-parser` et ont été appliqués deux fois
de suite dans une base PostgreSQL embarquée (PGlite, avec `auth`/`pgcrypto` simulés) sans erreur,
ce qui confirme l'idempotence et la cohérence des objets créés.

## Application

```bash
# Avec le CLI Supabase et Docker disponibles
supabase db push

# Ou, pour un projet hébergé, coller chaque fichier dans le SQL Editor
# puis exécuter les tests :
npm run test:backend
```

Les tests nécessitent `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`
(voir `.env.example`). Le service-role sert uniquement à créer les identités isolées de test.

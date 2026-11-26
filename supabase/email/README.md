# Emails d'authentification PAYZIK — configuration

## État actuel

Les modèles et la configuration locale sont préparés dans ce dépôt :

- Expéditeur : **Payzik**
- Adresse d'expédition retenue pour le test gratuit : `onboarding@resend.dev` (production : `no-reply@payzik.ma` après vérification d'un domaine)
- SMTP : **custom SMTP**, identifiants lus depuis l'environnement (`PAYZIK_SMTP_*`), jamais stockés dans le frontend
- Modèles : `supabase/templates/*.html`
- Configuration locale/CLI : `supabase/config.toml`

**Aucun email marqué PAYZIK n'a été envoyé ni reçu lors de cette intervention.**
La configuration n'est donc PAS déclarée opérationnelle. Elle ne sera considérée comme opérationnelle
qu'après réception réelle d'un email de test envoyé depuis l'identité d'expéditeur Payzik.

## Audit du 26/11/2026

Relevé via l'endpoint public `/auth/v1/settings` du projet hébergé :

- fournisseur **email activé**, inscription ouverte ;
- **confirmation d'email obligatoire** (`mailer_autoconfirm: false`) ;
- aucun fournisseur OAuth actif, téléphone désactivé ;
- cet endpoint n'expose **ni l'expéditeur, ni la configuration SMTP, ni les modèles** : l'identité réellement en place côté hébergement reste donc **non vérifiable** sans `SUPABASE_ACCESS_TOKEN`.

Côté dépôt : `supabase/config.toml` porte le nom `Payzik`, l'adresse de test `onboarding@resend.dev` (production : `no-reply@payzik.ma` après vérification d'un domaine) et les 13 modèles. Les identifiants SMTP sont lus depuis l'environnement (`PAYZIK_SMTP_*`) et sont absents de `.env`.

Commande de contrôle sans divulgation de secret :

```bash
npm run email:check
```

## Mode test gratuit (option 2 — retenue)

Sans domaine acheté, l'expéditeur utilisé est `Payzik <onboarding@resend.dev>`.

Configuration Resend :

- compte créé sur `resend.com` (gratuit, sans carte) ;
- **aucune vérification de domaine nécessaire** pour ce mode ;
- clé API créée dans **API Keys → Create API key** ;
- SMTP : host `smtp.resend.com`, port `465`, username `resend`, password = clé `re_...`.

Configuration Supabase : **Authentication → Email → SMTP Settings**, activer *Enable custom SMTP*, puis Sender name `Payzik`, Sender email `onboarding@resend.dev`, et les mêmes paramètres SMTP.

**Limite officielle Resend** : `onboarding@resend.dev` ne peut envoyer qu'à **l'adresse email associée au compte Resend**. Ce mode sert donc uniquement à valider les modèles et les liens. Pour envoyer aux utilisateurs, il faudra vérifier un domaine et remplacer `PAYZIK_FROM_EMAIL` par une adresse sur ce domaine.

`npm run email:check` affiche un avertissement tant que l'expéditeur est `@resend.dev`.

## Variables Supabase utilisées

Les modèles utilisent exclusivement les variables prises en charge par Supabase Auth :

- `{{ .ConfirmationURL }}` — lien de vérification / récupération / connexion réel
- `{{ .Token }}` — OTP pour la réauthentification
- `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .OldEmail }}`
- `{{ .Phone }}`, `{{ .OldPhone }}`
- `{{ .Provider }}`, `{{ .FactorType }}`

Aucun code inventé, aucun token remplacé, aucun secret dans les templates.

## Projet Supabase hébergé — étapes manuelles obligatoires

1. **Domaine**
   - Vérifier `payzik.ma` (ou le domaine retenu) dans le fournisseur DNS.
   - Créer l'enregistrement d'envoi `no-reply@payzik.ma` côté SMTP.
   - Publier **SPF**, **DKIM** et **DMARC** ; attendre la propagation DNS.
   - Dans Supabase : *Project Settings → Custom SMTP*, saisir hôte, port, utilisateur et mot de passe
     fournis par le fournisseur SMTP, puis :
     - Sender name : `Payzik`
     - Sender email : `no-reply@payzik.ma`
   - Ne jamais coller ces identifiants dans une variable `VITE_*` ni dans le code client.

2. **Confirmation email**
   - *Authentication → Providers → Email* : activer **Confirm email**.
   - *Authentication → URL Configuration* : ajouter l'URL de production
     `https://payzik-l5fn.vercel.app` aux redirect URLs autorisées.
   - Activer la double confirmation lors d'un changement d'adresse si le fournisseur le permet.

3. **Modèles**
   - *Authentication → Email Templates* : coller le contenu de chaque fichier
     `supabase/templates/*.html` dans le modèle correspondant et reprendre les objets de
     `supabase/config.toml`.
   - Activer les notifications de sécurité correspondantes.
   - Désactiver le suivi de liens ("email tracking") chez le fournisseur SMTP : il casse les liens Supabase.

4. **Test réel**
   - Déclencher une inscription, une récupération de mot de passe et un changement d'email
     depuis l'application déployée.
   - Vérifier que l'en-tête `From` affiche bien `Payzik <no-reply@payzik.ma>`.
   - Ouvrir chaque lien et confirmer que le flux Supabase se termine correctement.
   - Ce n'est qu'après ces réceptions effectives que la configuration peut être annoncée comme opérationnelle.

## Management API (optionnel, si un token d'accès est fourni)

Les mêmes modèles peuvent être poussés via l'API Supabase. Aucun token n'est présent dans ce dépôt.

```bash
export SUPABASE_ACCESS_TOKEN="..."          # fourni manuellement
export SUPABASE_PROJECT_REF="..."           # fourni manuellement

curl -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @supabase/email/hosted-auth-config.json
```

`hosted-auth-config.json` contient les objets et modèles PAYZIK. Les champs SMTP spécifiques au
projet hébergé sont à renseigner dans le Dashboard (ou via les clés documentées par Supabase)
avec les vrais identifiants du fournisseur.

## Développement local

```bash
export PAYZIK_SMTP_HOST=smtp.example.com
export PAYZIK_SMTP_USER=...
export PAYZIK_SMTP_PASS=...
supabase stop && supabase start
```

Les emails locaux peuvent être inspectés avec Mailpit. Le fichier `supabase/config.toml`
utilise `env(PAYZIK_SMTP_*)` : aucun secret n'est versionné.

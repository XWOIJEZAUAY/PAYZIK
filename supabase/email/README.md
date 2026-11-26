# Emails d'authentification PAYZIK — configuration

## État actuel

Les modèles et la configuration locale sont préparés dans ce dépôt :

- Expéditeur : **Payzik**
- Adresse d'expédition prévue : `no-reply@payzik.ma` (à remplacer si le domaine vérifié est différent)
- SMTP : **custom SMTP**, identifiants lus depuis l'environnement (`PAYZIK_SMTP_*`), jamais stockés dans le frontend
- Modèles : `supabase/templates/*.html`
- Configuration locale/CLI : `supabase/config.toml`

**Aucun email marqué PAYZIK n'a été envoyé ni reçu lors de cette intervention.**
La configuration n'est donc PAS déclarée opérationnelle. Elle ne sera considérée comme opérationnelle
qu'après réception réelle d'un email de test envoyé depuis l'identité d'expéditeur Payzik.

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

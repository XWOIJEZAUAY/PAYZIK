# PAYZIK POS

La caisse et le portefeuille des commerces du Maroc : encaissement, stock,
kridi, restaurant et carte PAYZIK dans une seule application.

## Identité visuelle

Palette officielle : crème `#FFF8EA`, sable `#F4EDDF`, encre nuit `#0A2230`,
orange `#FF7A1A` (couleur principale), menthe pour les états positifs, corail
et or pour les offres. Aucun noir ni blanc pur n'est utilisé.

## Démarrage

```bash
npm install
npm run dev -- --port 5173     # http://localhost:5173
```

Clés API dans `.env` (voir `.env.example`) :

```
VITE_GEMINI_API_KEY=...
VITE_ANTHROPIC_API_KEY=...
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (Vite) |
| `npm run build` | typecheck (`tsc -b`) + build production |
| `npm run preview` | sert le build |
| `npm run lint` | oxlint |

## Architecture (par domaine)

```
src/
├─ app/          App.tsx (shell + navigation)
├─ components/
│  ├─ ui/        primitives (Button, Card, Modal, Drawer…)
│  └─ layout/    Sidebar, Header
├─ features/
│  ├─ pos/       ProductGrid, CartPanel
│  ├─ kridi/     KridiView (carnet de crédit)
│  ├─ stock/     StockView, StockAlertsDrawer
│  ├─ dashboard/ DashboardView
│  ├─ settings/  SettingsView
│  └─ voice/     VoiceInput, LiveVoiceModal, ScannerModal
├─ services/
│  └─ ai/        gemini, live (temps réel), claude, ringtone, index
├─ state/        store.ts (produits, clients, ventes, kridi)
├─ lib/          format.ts (fmtDh, daysSince), image.ts (vignettes)
├─ data/         demo.ts (données de démonstration)
├─ types/        types métier (Product, Client, Sale…)
└─ config/       env.ts (clés API Vite)
```

Conventions : `features/*` consomment `components/ui`, `state`, `lib` et `types`
via des imports relatifs ; `services/ai` ne dépend que de `types` et `config`.

## Mobile (Android + PWA)

L'application est une PWA installable (icônes, plein écran, hors-ligne) et peut
être empaquetée en APK Android avec Capacitor, sans réécrire le code React.

```bash
npm run icons          # régénère public/icons/*.png si besoin
npm run build          # dist/
npx cap add android    # une seule fois, crée le dossier android/
npm run mobile:sync    # rebuild + copie dist/ dans le projet Android
npm run mobile:android # sync + ouvre Android Studio
```

Prérequis Android : **JDK 21 et Android Studio** (gratuits). Le projet `android/`
est déjà généré ; il reste à ouvrir Android Studio et à lancer le build APK.

Le projet natif iOS est aussi généré dans `ios/`, mais sa compilation exige un
**Mac avec Xcode + CocoaPods** (impossible depuis Windows). Sur Mac :

```bash
npm run mobile:sync
cd ios/App && pod install && cd ../..
npx cap open ios
```

Voie **100 % gratuite pour iPhone** sans Mac : installer la PWA depuis un
hébergement HTTPS (elle apparaît alors comme une app avec icône et plein écran).

### PWA

- `public/manifest.webmanifest` + `public/sw.js` : installation sur iOS/Android
  depuis n'importe quel hébergement HTTPS gratuit (Cloudflare Pages, Netlify…).
- Le service worker met en cache l'app shell ; les appels IA/Supabase restent
  sur le réseau. Page de repli : `public/offline.html`.

### Synchronisation Supabase (optionnelle)

Sans configuration, tout reste dans `localStorage`. Pour activer la sync cloud
via le plan gratuit :

1. Créer un projet sur https://supabase.com.
2. Exécuter `supabase/schema.sql` dans le SQL Editor.
3. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env`
   (et dans les variables d'environnement de l'hébergeur).
4. Redémarrer : `hydrateBackend()` charge l'état cloud avant le rendu React,
   puis `startBackendSync()` pousse toutes les 5 s si les données ont changé.

⚠️ La table de démo est publique en lecture/écriture. Ajoute Supabase Auth + RLS
avant d'y stocker de vraies données financières.

## Déploiement gratuit (PWA)

Le build `dist/` est un site statique : il se déploie gratuitement sur HTTPS,
condition nécessaire pour que l'installation PWA fonctionne sur mobile.

### Option A — Netlify (la plus rapide, sans Git)

1. `npm run build`
2. Glisse le dossier `dist/` dans https://app.netlify.com/drop
3. L'URL `*.netlify.app` est active immédiatement (SSL inclus).

`netlify.toml`, `public/_redirects` et `public/_headers` sont déjà fournis.

### Option B — Cloudflare Pages avec GitHub (recommandé)

1. Crée un repo GitHub et pousse le projet (le `.env` est ignoré).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Paramètres : preset **Vite**, build `npm run build`, sortie `dist`,
   variable `NODE_VERSION = 22`.
4. Ajoute si besoin les variables `VITE_*` (Gemini, Anthropic, Supabase).
5. Déploie : URL `*.pages.dev`, SSL et domaine custom gratuits.

### Option C — GitHub Actions (déploiement automatique)

Le workflow `.github/workflows/deploy-cloudflare.yml` est prêt. Ajoute ces
**secrets** au repo GitHub :

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_GEMINI_API_KEY`, `VITE_ANTHROPIC_API_KEY` (optionnels)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optionnels)

Le projet Cloudflare `payzik-pos` doit exister (le créer une première fois
depuis le dashboard ou avec `wrangler pages project create payzik-pos`).

⚠️ Les variables `VITE_*` sont embarquées dans le JS public : n'y mets que des
clés de démonstration ou des clés restreintes par domaine.

# Refonte frontend mobile PAYZIK — rapport de livraison

## Périmètre

Refonte **frontend uniquement** de l'application mobile PAYZIK, selon le cahier des charges
visuel textuel fourni. Aucune table SQL, migration, RPC, politique RLS, fonction backend ni
mécanisme d'authentification n'a été modifié. Aucune donnée fictive n'est introduite dans le
code livré : toutes les valeurs affichées proviennent des services réels
(`useClientCard`, `useClientSpending`, `listShops`, `listMyShops`, `listShopOrders`,
`listClientOrders`, `requestCardPayment`, `listActiveOffers`, `listPartnerAds`, `runAgentText`,
`parseVoiceText`, `parseVoiceOrder`, `store`).

L'inventaire préalable est conservé dans [`INVENTAIRE_REFONTE.md`](./INVENTAIRE_REFONTE.md).

## Design system

- Palette appliquée globalement : fuchsia `#E91E83`, rose `#F43F9E`, violet profond `#51206F`,
  violet intermédiaire `#8136A8`, lavande `#F1E5FA`, rose pastel `#FCEAF4`, texte `#21152C`,
  texte secondaire `#81748A`.
- `tailwind.config.js` et `src/index.css` : tokens de couleurs, ombres, rayons, transitions,
 safe areas iOS/Android.
- Primitives (`src/features/mobile/ui.tsx`) harmonisées : boutons primary/soft/dark avec états
 `active:` cohérents, `TabBar` active en fuchsia.
- Inter conservée comme police principale.

## Coquille mobile

- Hauteur pleine (`100dvh`), navigation inférieure fixe, contenu scrollant indépendamment,
 `padding-bottom` réservé à la barre d'onglets, safe areas `env(safe-area-inset-*)`.
- Largeur maximale 430 px, centrée sur tablette/desktop sans rétrécissement artificial.
- Navigation Client : **Accueil / Carte / Boutiques / Profil**. L'assistant catalogue reste
 accessible par navigation interne depuis `Boutiques`.
- Navigation Marchand : **Accueil / Caisse / Stock / Clients / Profil**. Cartes, recharges,
 promos, commandes et bilan restent accessibles depuis `Accueil`.
- Cache du service worker bumpé `payzik-shell-v4` → `payzik-shell-v5`.

## Écrans Client

- Accueil : en-tête fuchsia « Bonjour, {prénom} 👋 », avatar réel, portefeuille dominant avec
 solde réel, masquage du solde, carte digitale, QR réel généré depuis `card.code`, actions
 rapides `Payer` / `Recevoir` / `Boutiques`, fidélité et offres construites uniquement à partir
 des boutiques et promotions réelles, dernières activités réelles.
- `Carte` : portefeuille, QR personnel, demande de recharge, historique.
- `Boutiques` : grille 2 colonnes avec photo réelle, ville, promo réelle, `Voir` et paiement.
- `Paiement` : boutique réelle sélectionnée, montant, solde disponible, total, bouton
 `Continuer`. **Aucune confirmation financière n'est affichée avant le résultat backend.**
- `Historique` : feuille `Mes transactions` avec filtres `Toutes / Paiements / Commandes`,
 alimentée par `useClientSpending` et `listClientOrders()`.

## Écrans Marchand

- Accueil : CA du jour réel, variation vs hier, graphique 7 jours réel, KPI ventes/clients/
 commandes, notifications et dernières ventes réelles, accès interne aux sections avancées.
- Caisse IA :
  - état initial **réellement vide**, sans produit préchargé ;
  - assistant animé avec message d'accueil, actions `Parler` et `Scanner les produits`,
   saisie texte et sélecteur de langue `Français`, `Darija marocaine`, `Tamazight — Souss / Tachelhit` ;
  - état d'écoute immersif violet profond (micro, cercles concentriques, waveform,
   « Écoute en cours... », « Vous pouvez parler maintenant », `Annuler`) ;
  - panier `Votre panier` avec lignes réelles, quantités +/-, suppression, total,
   `Voir le ticket` et `Continuer à ajouter` ;
  - ticket animé avec vrai nom de boutique et vrai numéro de ticket, `Partager`, `Imprimer`,
   et trois grandes modalités : `Carte PAYZIK / Scanner QR`, `Espèces / Cash`, `Crédit / Kridi`, `Retour`.
- Scanner produit dédié (`src/features/mobile/ProductScanSheet.tsx`) : caméra réelle,
 `BarcodeDetector` EAN/UPC quand le navigateur/appareil le prend en charge, correspondance avec
 `Product.barcode`, message explicite si code inconnu ou caméra refusée, repli explicite vers la
 détection photo IA existante. Ce scanner est distinct du scanner QR client (`CardScanSheet`).
- Langue IA : `src/lib/aiLang.ts` gère trois langues ; `src/services/ai/gemini.ts` applique la
 langue choisie à la transcription, à la réponse parlée, à la synthèse vocale et aux prompts
 texte/audio, sans invention de produits ni de montants.
- Stock, Clients, Carnet Kridi et Profil : données réelles du `store`, recherche, création
 client, KPI Kridi et navigation interne.
- Les libellés fictifs « Hanout Al Baraka » ont été retirés du ticket et du message de relance Kridi.

## Animations conservées

`animate-fade-up`, `animate-scale-in`, `animate-slide-in-right`, `animate-popIn`,
`animate-paperUnfold`, `animate-toast-in`, `animate-scan-line`, `animate-shimmer`,
`animate-spin`, `animate-ping`, `animate-wave`, ainsi que les délais d'échelonnement
`i*45ms`, `i*85ms`, `Math.min(i,14)*40ms`, `Math.min(i,12)*45ms`.

## Captures

Captures réelles du navigateur, recadrées sur le shell mobile (profil QA local, sans compte de
production) :

### Client (390 px)
- `docs/captures/client-accueil-390.png`
- `docs/captures/client-boutiques-390.png`
- `docs/captures/client-paiement-390.png`
- `docs/captures/client-qr-390.png`
- `docs/captures/client-historique-390.png`
- `docs/captures/client-scan-payer-390.png`

### Marchand (390 px)
- `docs/captures/merchant-accueil-390.png`
- `docs/captures/merchant-caisse-vide-390.png`
- `docs/captures/merchant-caisse-assistant-ia-390.png`
- `docs/captures/merchant-caisse-produits-390.png`
- `docs/captures/merchant-ticket-390.png`
- `docs/captures/merchant-modalites-paiement-390.png`
- `docs/captures/merchant-stock-390.png`
- `docs/captures/merchant-kridi-390.png`
- `docs/captures/merchant-clients-390.png`
- `docs/captures/merchant-profil-390.png`

### Tests de largeur (Accueil Client)
`client-accueil-320.png`, `client-accueil-360.png`, `client-accueil-375.png`,
`client-accueil-390.png`, `client-accueil-414.png`, `client-accueil-430.png`.

## Vérifications

- `npm run build` (TypeScript strict + Vite) : **vert**, dernier build `✓ built in 3.94s`.
- Largeurs testées : **320, 360, 375, 390, 414, 430 px**.
  - `scrollWidth === clientWidth` sur le shell pour les deux rôles et les écrans principaux ;
  - aucun débordement horizontal global ;
  - navigation inférieure fixe et safe areas conservées ;
  - correctif appliqué à 320 px sur la carte portefeuille (mini-QR masqué sous 360 px) et sur
   les libellés du menu marchand (`truncate`).
- Tablet/desktop : shell conservé centré avec largeur max 430 px, sans mise en page cassée.

## Limitations

- **Aucun compte de production n'a été fourni.** Les captures ont donc été réalisées avec un
 profil QA local, backend désactivé temporairement via un `.env.local` supprimé avant commit.
 Les écrans backend sont capturés dans leurs **états réels vides** (`0 DH`, « aucune donnée »).
 Pour les écrans nécessitant une carte ou une boutique (QR, paiement, boutiques), une carte et
 une boutique **de test locale** ont été injectées uniquement dans le navigateur pendant la
 capture, puis les stub temporaires ont été retirés du code. Aucune donnée de test n'est livrée.
- L'écoute immersive dépend de la disponibilité de l'API Gemini et du microphone. En QA sans
 clé IA, l'assistant affiche « Indisponible. Écris ta commande. » ; l'overlay d'écoute reste
 implémenté et sera visible avec une clé et un micro disponibles.
- La lecture des codes-barres dépend de `BarcodeDetector` (Chrome Android notamment). Sur les
 navigateurs qui ne le prennent pas en charge, le scanner propose explicitement le repli photo
 IA existant.
- Le modèle n'a pas pu inspecter visuellement les images des captures ( limitation de lecture
 d'images) ; la vérification a porté sur le texte rendu, la géométrie DOM et les métriques de
 débordement.
- Le bundle reste > 500 kB (avertissement Vite préexistant, non traité dans ce périmètre).

## Fichiers principaux modifiés

- `src/features/mobile/client.tsx`, `merchant.tsx`, `PayzikMobile.tsx`, `ui.tsx`,
  `ClientCardSheet.tsx`, `ClientCatalog.tsx`, `CardScanSheet.tsx`, `GoogleAdBanner.tsx`,
  `PartnerAdBanner.tsx`, `MerchantOffers.tsx`, `MerchantOrders.tsx`, `MerchantRecharges.tsx`,
  `ProfileSettings.tsx`, `client-kridi.tsx`
- `src/features/mobile/ProductScanSheet.tsx` (nouveau)
- `src/lib/aiLang.ts`, `src/services/ai/gemini.ts`
- `src/services/backend/payzikCards.ts`, `src/types/index.ts`
- `src/index.css`, `tailwind.config.js`, `public/sw.js`
- `docs/INVENTAIRE_REFONTE.md`, `docs/REFONTE_FRONTEND_RAPPORT.md`, `docs/captures/*`

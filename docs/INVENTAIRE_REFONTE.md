# PAYZIK — Inventaire avant refonte frontend (27/11/2026)

Mission : refonte **frontend uniquement**, mobile-first, d'après le cahier des charges visuel fourni.
Aucun backend, table SQL, RPC, RLS ni flux d'authentification n'est modifié.

## 1. Architecture réellement montée

```
src/main.tsx          → hydrateBackend() (no-op) + <App/>
src/app/App.tsx       → AuthView → GoogleSetup → PayzikMobile
src/features/mobile/PayzikMobile.tsx
   ├─ user.role === "merchant" → MerchantSpace
   └─ sinon                    → ClientSpace
```

Composants legacy présents mais **non montés** (ne pas réintroduire leurs données de démo) :
`CustomerApp.tsx`, `CardsView.tsx`, `QrScanModal.tsx`, `KridiView.tsx`, `client-kridi.tsx`,
`state/network.ts`, `data/network.ts`, `RestaurantApp.tsx`, `DashboardView.tsx`.

## 2. Coque mobile actuelle

| Fichier | Rôle | État |
|---|---|---|
| `PayzikMobile.tsx` | `max-w-[430px]`, `h-[100dvh]`, toast animé, overlay profil | À harmoniser (pleine largeur sur mobile, safe areas déjà présentes) |
| `ui.tsx` | `Pane`, `Btn`, `IconBtn`, `Avatar`, `Sheet`, `TabBar`, `SectionHead`, `Empty`, `Kpi`, `StockPill` | Réutilisables → à étendre (`MobileHeader`, `WalletCard`, etc.) |
| `index.css` | tokens CSS, safe areas, `tnum`, `money`, scrollbar | Palette à remplacer |
| `tailwind.config.js` | couleurs, ombres, keyframes | Palette à remplacer, animations à conserver |

## 3. Écrans Client (actuels)

| Écran | Fichier / fonction | Données réelles | Manques vs maquette |
|---|---|---|---|
| Accueil | `client.tsx` `ClientHeader` + `ClientHome` | `useClientCard`, `useClientSpending`, `listShops`, `listActiveOffers`, `listPartnerAds` | Header fuchsia absent, carte portefeuille pas assez proéminente, pas de cartes de fidélité, pas de carte promo dédiée, pas de notifications réelles |
| Carte | `client.tsx` `ClientCard` + `ClientCardSheet` + `CloudRechargePanel` | carte Supabase, QR réel (`qrcode`) | OK fonctionnellement, à redessiner |
| Boutiques | `client.tsx` `ClientShops` + `ShopCard` | `listShops()` (city/address déjà mappés) | Grille 2 colonnes avec photos absente, filtres forcés (`kind`), note non réelle |
| Catalogue | `ClientCatalog.tsx` | `prep_orders` realtime, moteur `norm/matchProduct/parseRequest` | À conserver tel quel fonctionnellement |
| Paiement | `client.tsx` `PayModal` | `requestCardPayment` | Présentation à revoir (boutique, solde, quantités, confirmation backend) |
| QR | `ClientCardSheet.tsx` | QR réel généré | Présentation à revoir |
| Transactions | `useClientSpending` (dans onglet Carte) | Supabase spending | Écran dédié avec filtres absent |

Navigation client actuelle : `home`, `card`, `shops`, `catalog` (libellé « Message »).
Navigation demandée : **Accueil, Carte, Boutiques, Profil** (Profil = overlay existant).
→ Le catalogue reste accessible par navigation interne depuis une boutique.

## 4. Écrans Marchand (actuels)

| Écran | Fichier / fonction | Données réelles | Manques vs maquette |
|---|---|---|---|
| Accueil business | **absent** (le tab par défaut est `caisse`) | `store.sales`, `listMyShops` | À créer : CA du jour, KPI ventes/clients/commandes, notifications, dernières ventes |
| Caisse IA | `merchant.tsx` `Caisse` | `runAgentText`, `parseVoiceText`, `LiveSession`, `createLiveToolHandlers`, `store` local isolé | Présentation à harmoniser ; état initial vide OK (msgs = []) ; sélecteur langue à étendre (Français/Darija/Tachelhit) ; bouton scanner produit à ajouter ; sélecteur de moyen de paiement à rendre explicite |
| Stock | `merchant.tsx` `MerchantStock`, `ProductEditorSheet`, `AddProductModal` | `store.products`, Open Food Facts | Déjà animé (`animate-fade-up`, délais `Math.min(i,14)*40ms`) → préserver |
| Kridi / Clients | `MerchantKridi`, `KridiPickModal`, `AcompteModal` | `store.clients`, `payDebt` | 4 KPI, recherche, fiches détaillées à ajouter |
| Profil | `ProfileSettings.tsx` (overlay) | `user`, Supabase auth | Présentation à revoir |
| Cartes / Recharges / Promos / Commandes / Bilan | `MerchantCards`, `MerchantRecharges`, `MerchantOffers`, `MerchantOrders`, `Bilan` | Supabase + store | Doivent rester accessibles par **navigation interne** (plus d'onglets 8) |

Navigation marchande actuelle : 8 onglets. Navigation demandée : **Accueil, Caisse, Stock, Clients, Profil**.

## 5. Animations existantes à préserver (aucune suppression)

`animate-fade-up`, `animate-scale-in`, `animate-slide-in-right`, `animate-popIn`,
`animate-paperUnfold`, `animate-toast-in`, `animate-scan-line`, `animate-shimmer`,
`animate-spin`, `animate-ping`, `animate-wave`.

Délais : `i*45ms` (confettis), `i*85ms` (lignes de ticket), `Math.min(i,14)*40ms`
(cartes produits), `Math.min(i,12)*45ms` (cartes PAYZIK).

## 6. Services réels utilisés (contrats à respecter)

- `services/backend/payzikCards` : `listShops`, `listMyShops`
- `services/backend/payzikOrders` : `requestCardPayment`
- `services/backend/payzikSpending` : `useClientSpending`
- `services/backend/payzikOffers`, `payzikPartnerAds`
- `services/ai` : `aiAvailable`, `matchProducts`, `parseVoiceText`
- `services/ai/live` + `liveTools` : voix Gemini Live
- `services/ai/agent` : `runAgentText`, `shortReply`
- `lib/aiLang` : langue IA (darija / tachelhit)
- `state/store.ts` : panier, ventes, cartes, clients (localStorage isolé par utilisateur)

## 7. Palette cible (extraite du cahier des charges)

| Rôle | Hex |
|---|---|
| Fuchsia principal / actions | `#E91E83` |
| Rose | `#F43F9E` |
| Violet profond | `#51206F` |
| Violet intermédiaire | `#8136A8` |
| Lavande | `#F1E5FA` |
| Rose pastel | `#FCEAF4` |
| Blanc | `#FFFFFF` |
| Texte principal | `#21152C` |
| Texte secondaire | `#81748A` |

## 8. Méthode (incrémentale, sans régression)

1. Harmoniser les tokens de couleur (mapping global) — build.
2. App Shell : pleine hauteur, header, bottom nav 4/5 onglets, safe areas — build.
3. Client : accueil, boutiques, paiement, QR, historique — build.
4. Marchand : accueil business, caisse IA, stock, kridi/clients, profil — build.
5. Captures réelles 320/360/375/390/414/430 px + build final + rapport.

**Règle absolue** : aucune donnée fictive, aucun faux solde, aucun faux paiement,
aucune confirmation financière avant résultat backend réel. Si une opération n'existe
pas dans les services, afficher un état d'erreur propre et documenter le manque.

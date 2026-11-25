export type Category = "Boissons" | "Épicerie" | "Hygiène" | "Frais";

export interface Product {
  id: string;
  name: string;
  priceDh: number;
  stock: number;
  category: Category;
  emoji: string;
  aliases: string[]; // darija / variantes pour la dictée vocale
  image?: string; // photo du produit (data URL base64)
  rating?: number; // note moyenne (0-5)
  ratingCount?: number; // nombre d'avis
}

export interface CartLine {
  productId: string;
  qty: number;
}

export interface KridiEntry {
  id: string;
  amountDh: number; // + dette (achat à crédit), - acompte
  label: string;
  date: string; // ISO
  items?: { name: string; qty: number; priceDh: number }[]; // ce qui a été acheté à crédit
}

export interface Client {
  id: string;
  name: string;
  debtDh: number;
  since: string; // ISO — date de la plus ancienne dette
  history: KridiEntry[];
  phone?: string; // téléphone (infos perso)
  note?: string; // note libre (adresse, famille…)
}

export interface Sale {
  id: string;
  ticketNo: number;
  lines: { name: string; qty: number; priceDh: number }[];
  totalDh: number;
  method: "cash" | "kridi" | "card" | "wallet";
  clientName?: string;
  date: string;
}

/** Carte PAYZIK rechargeable : le code QR = identifiant unique, le solde vit dans l'appli. */
export interface WalletCard {
  id: string;
  code: string; // identifiant public (encodé dans le QR)
  name: string;
  phone?: string;
  pin?: string; // 4 chiffres, requis au-dessus du seuil
  balanceDh: number;
  createdAt: string;
}

/** Une opération sur une carte (recharge ou paiement). */
export interface CardTx {
  id: string;
  cardId: string;
  type: "topup" | "pay";
  amountDh: number; // toujours positif ; le signe vient du type
  label: string;
  at: string;
}

export type View =
  | "pos"
  | "catalogue"
  | "cards"
  | "kridi"
  | "stock"
  | "dashboard"
  | "settings";

/* ============================================================
   RÉSEAU PAYZIK — 3 espaces connectés
   ============================================================ */

export type Role = "merchant" | "customer";

export type EstablishmentKind = "hanout" | "epicerie" | "pharmacie" | "cafe" | "patisserie";

export type Tone = "navy" | "teal" | "amber" | "rose" | "indigo";

/** Commerce partenaire du réseau (visible par le client). */
export interface Establishment {
  id: string;
  name: string;
  kind: EstablishmentKind;
  city: string;
  district: string;
  rating: number;
  reviews: number;
  tags: string[];
  cashbackPct: number;
  distanceKm: number;
  promo?: string;
  tone: Tone;
}

/** Publicité / offre du réseau. */
export interface Ad {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  sponsor: string;
  tone: Tone;
}

export type MenuCategory = "Entrées" | "Plats" | "Grillades" | "Boissons" | "Desserts";

/** Plat du restaurant. */
export interface MenuItem {
  id: string;
  name: string;
  priceDh: number;
  category: MenuCategory;
  description: string;
  available: boolean;
}

export interface OrderLine {
  name: string;
  qty: number;
  priceDh: number;
}

/** Commande passée à une table numérotée. */
export interface RestaurantOrder {
  id: string;
  tableNo: number;
  lines: OrderLine[];
  totalDh: number;
  status: "new" | "preparing" | "served";
  paid: boolean;
  method?: "cash" | "card" | "kridi";
  customerName?: string;
  cardCode?: string;
  createdAt: string;
}

/** Profil de l'utilisateur PAYZIK (client final). */
export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  city: string;
  /** Code de la carte PAYZIK liée au portefeuille. */
  cardCode: string;
}

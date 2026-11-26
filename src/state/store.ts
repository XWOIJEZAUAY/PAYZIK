import { useCallback, useEffect, useMemo, useState } from "react";
import { daysSince, fmtDh } from "../lib/format";
import type { CardTx, CartLine, Client, KridiEntry, Product, Sale, WalletCard } from "../types";

/** Espace de stockage isolé par utilisateur (pas de données partagées ni de démo). */
function keyFor(userId: string, name: string) {
  return `payzik.${userId || "anon"}.${name}`;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial));
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

/** Code public unique d'une carte, encodé dans le QR (ex. PZK-8F3K-92). */
function makeCode() {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PZK-${part()}-${part()}`;
}

export function useStore(userId = "anon") {
  const productsKey = keyFor(userId, "products");
  const clientsKey = keyFor(userId, "clients");
  const salesKey = keyFor(userId, "sales");
  const ticketKey = keyFor(userId, "ticketNo");
  const cardsKey = keyFor(userId, "cards");
  const cardTxKey = keyFor(userId, "cardTx");

  const [products, setProducts] = useState<Product[]>(() => load<Product[]>(productsKey, []));
  useEffect(() => {
    localStorage.setItem(productsKey, JSON.stringify(products));
  }, [productsKey, products]);
  const [clients, setClients] = usePersisted<Client[]>(clientsKey, []);
  const [sales, setSales] = usePersisted<Sale[]>(salesKey, []);
  const [ticketNo, setTicketNo] = usePersisted<number>(ticketKey, 1);
  const [cards, setCards] = usePersisted<WalletCard[]>(cardsKey, []);
  const [cardTx, setCardTx] = usePersisted<CardTx[]>(cardTxKey, []);
  const [cart, setCart] = useState<CartLine[]>([]);

  const productById = useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  );

  const addToCart = useCallback((productId: string, qty = 1) => {
    setCart((c) => {
      const existing = c.find((l) => l.productId === productId);
      if (existing)
        return c.map((l) =>
          l.productId === productId ? { ...l, qty: l.qty + qty } : l,
        );
      return [...c, { productId, qty }];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setCart((c) =>
      qty <= 0
        ? c.filter((l) => l.productId !== productId)
        : c.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, l) => sum + (productById(l.productId)?.priceDh ?? 0) * l.qty, 0),
    [cart, productById],
  );

  /** Encaisse le panier (cash / carte / kridi). Retourne la vente créée. */
  const checkout = useCallback(
    (method: Sale["method"], clientId?: string): Sale | null => {
      if (cart.length === 0) return null;
      const lines = cart.map((l) => {
        const p = productById(l.productId)!;
        return { name: p.name, qty: l.qty, priceDh: p.priceDh };
      });
      const total = cartTotal;
      const client = clients.find((c) => c.id === clientId);
      const sale: Sale = {
        id: `s-${Date.now()}`,
        ticketNo,
        lines,
        totalDh: total,
        method,
        clientName: client?.name,
        date: new Date().toISOString(),
      };
      setSales((s) => [sale, ...s]);
      setTicketNo((n) => n + 1);
      // décrément du stock
      setProducts((ps) =>
        ps.map((p) => {
          const line = cart.find((l) => l.productId === p.id);
          return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
        }),
      );
      // dette kridi
      if (method === "kridi" && client) {
        setClients((cs) =>
          cs.map((c) =>
            c.id === client.id
              ? {
                  ...c,
                  debtDh: c.debtDh + total,
                  since: c.debtDh === 0 ? new Date().toISOString() : c.since,
                  history: [
                    {
                      id: `k-${Date.now()}`,
                      amountDh: total,
                      label: `Ticket #${ticketNo}`,
                      date: new Date().toISOString(),
                      items: lines,
                    },
                    ...c.history,
                  ],
                }
              : c,
          ),
        );
      }
      setCart([]);
      return sale;
    },
    [cart, cartTotal, clients, productById, setClients, setProducts, setSales, setTicketNo, ticketNo],
  );

  /** Annule une vente déjà confirmée (remet le stock et le kridi comme avant). */
  const voidSale = useCallback(
    (saleId: string): boolean => {
      const sale = sales.find((s) => s.id === saleId);
      if (!sale) return false;
      setSales((list) => list.filter((s) => s.id !== saleId));
      setProducts((ps) =>
        ps.map((p) => {
          const line = sale.lines.find((l) => l.name === p.name);
          return line ? { ...p, stock: p.stock + line.qty } : p;
        }),
      );
      if (sale.method === "kridi" && sale.clientName) {
        setClients((cs) =>
          cs.map((c) =>
            c.name === sale.clientName
              ? {
                  ...c,
                  debtDh: Math.max(0, c.debtDh - sale.totalDh),
                  history: c.history.filter((h) => h.label !== `Ticket #${sale.ticketNo}`),
                }
              : c,
          ),
        );
      }
      // Vente par carte PAYZIK : on recrédite la carte et on retire l'opération.
      if (sale.method === "wallet" || sale.method === "card") {
        const tx = cardTx.find(
          (t) => t.type === "pay" && t.label === `Ticket #${sale.ticketNo}`,
        );
        if (tx) {
          setCardTx((list) => list.filter((t) => t.id !== tx.id));
          setCards((cs) =>
            cs.map((c) =>
              c.id === tx.cardId ? { ...c, balanceDh: c.balanceDh + sale.totalDh } : c,
            ),
          );
        }
      }
      return true;
    },
    [cardTx, sales, setCards, setCardTx, setClients, setProducts, setSales],
  );

  /** Acompte sur une dette kridi. */
  const payDebt = useCallback(
    (clientId: string, amountDh: number) => {
      setClients((cs) =>
        cs.map((c) =>
          c.id === clientId
            ? {
                ...c,
                debtDh: Math.max(0, c.debtDh - amountDh),
                history: [
                  {
                    id: `k-${Date.now()}`,
                    amountDh: -amountDh,
                    label: "Acompte reçu",
                    date: new Date().toISOString(),
                  },
                  ...c.history,
                ],
              }
            : c,
        ),
      );
    },
    [setClients],
  );

  const addClient = useCallback(
    (name: string): Client => {
      const client: Client = {
        id: `c-${Date.now()}`,
        name,
        debtDh: 0,
        since: new Date().toISOString(),
        history: [],
      };
      setClients((cs) => [...cs, client]);
      return client;
    },
    [setClients],
  );

  /** Ajoute une dette au carnet de crédit (kridi) d'un client. */
  const addDebt = useCallback(
    (
      clientId: string,
      amountDh: number,
      label = "Achat à crédit",
      items?: KridiEntry["items"],
    ) => {
      setClients((cs) =>
        cs.map((c) =>
          c.id === clientId
            ? {
                ...c,
                debtDh: c.debtDh + amountDh,
                since: c.debtDh === 0 ? new Date().toISOString() : c.since,
                history: [
                  {
                    id: `k-${Date.now()}`,
                    amountDh,
                    label,
                    date: new Date().toISOString(),
                    items,
                  },
                  ...c.history,
                ],
              }
            : c,
        ),
      );
    },
    [setClients],
  );

  /** Modifie les infos personnelles d'un client (nom, téléphone, note). */
  const updateClient = useCallback(
    (clientId: string, patch: Partial<Pick<Client, "name" | "phone" | "note">>) => {
      setClients((cs) => cs.map((c) => (c.id === clientId ? { ...c, ...patch } : c)));
    },
    [setClients],
  );

  const adjustStock = useCallback(
    (productId: string, delta: number) => {
      setProducts((ps) =>
        ps.map((p) =>
          p.id === productId ? { ...p, stock: Math.max(0, p.stock + delta) } : p,
        ),
      );
    },
    [setProducts],
  );

  /** Modifie un produit (nom, prix, catégorie, emoji, image, alias…). */
  const updateProduct = useCallback(
    (productId: string, patch: Partial<Omit<Product, "id">>) => {
      setProducts((ps) => ps.map((p) => (p.id === productId ? { ...p, ...patch } : p)));
    },
    [setProducts],
  );

  /** Crée un nouveau produit (stock initial, sans image par défaut). */
  const addProduct = useCallback(
    (input: Omit<Product, "id">): Product => {
      const product: Product = { ...input, id: `p-${Date.now()}` };
      setProducts((ps) => [product, ...ps]);
      return product;
    },
    [setProducts],
  );

  const removeProduct = useCallback(
    (productId: string) => {
      setProducts((ps) => ps.filter((p) => p.id !== productId));
    },
    [setProducts],
  );

  // ---- cartes PAYZIK (portefeuille boucle fermée) ----
  /** Enregistre une opération et met à jour le solde de la carte. */
  const recordCardTx = useCallback(
    (cardId: string, type: CardTx["type"], amountDh: number, label: string) => {
      setCardTx((t) => [
        {
          id: `ct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          cardId,
          type,
          amountDh,
          label,
          at: new Date().toISOString(),
        },
        ...t,
      ]);
      setCards((cs) =>
        cs.map((c) =>
          c.id === cardId
            ? {
                ...c,
                balanceDh:
                  type === "topup" ? c.balanceDh + amountDh : c.balanceDh - amountDh,
              }
            : c,
        ),
      );
    },
    [setCards, setCardTx],
  );

  /** Crée une carte rechargeable (nom, téléphone, PIN optionnel, recharge initiale). */
  const addCard = useCallback(
    (input: {
      name: string;
      phone?: string;
      pin?: string;
      initialDh?: number;
    }): WalletCard => {
      const card: WalletCard = {
        id: `w-${Date.now()}`,
        code: makeCode(),
        name: input.name.trim(),
        phone: input.phone?.trim() || undefined,
        pin: input.pin?.trim() || undefined,
        // Le solde est crédité par recordCardTx ci-dessous (évite le double comptage).
        balanceDh: 0,
        createdAt: new Date().toISOString(),
      };
      setCards((cs) => [card, ...cs]);
      if (input.initialDh && input.initialDh > 0)
        recordCardTx(card.id, "topup", input.initialDh, "Recharge initiale");
      return card;
    },
    [recordCardTx, setCards],
  );

  const findCardByCode = useCallback(
    (code: string) =>
      cards.find((c) => c.code.toLowerCase() === code.trim().toLowerCase()),
    [cards],
  );

  const topUpCard = useCallback(
    (cardId: string, amountDh: number, label = "Recharge espèces") => {
      if (amountDh > 0) recordCardTx(cardId, "topup", amountDh, label);
    },
    [recordCardTx],
  );

  /** Débite la carte si le solde suffit. Retourne false si insuffisant. */
  const payWithCard = useCallback(
    (cardId: string, amountDh: number, label = "Paiement caisse"): boolean => {
      const card = cards.find((c) => c.id === cardId);
      if (!card || card.balanceDh < amountDh) return false;
      recordCardTx(cardId, "pay", amountDh, label);
      return true;
    },
    [cards, recordCardTx],
  );

  /** Encaisse le panier avec une carte PAYZIK : la carte doit exister en base
   *  et avoir assez de solde. Le solde est débité en même temps que la vente. */
  const checkoutWithCard = useCallback(
    (cardId: string): Sale | null => {
      const card = cards.find((c) => c.id === cardId);
      if (!card || cart.length === 0 || card.balanceDh < cartTotal) return null;
      recordCardTx(cardId, "pay", cartTotal, `Ticket #${ticketNo}`);
      return checkout("wallet");
    },
    [cards, cart.length, cartTotal, checkout, recordCardTx, ticketNo],
  );

  const updateCard = useCallback(
    (cardId: string, patch: Partial<Pick<WalletCard, "name" | "phone" | "pin">>) => {
      setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
    },
    [setCards],
  );

  const cardTxFor = useCallback(
    (cardId: string) => cardTx.filter((t) => t.cardId === cardId),
    [cardTx],
  );

  const resetAll = useCallback(() => {
    setProducts([]);
    setClients([]);
    setSales([]);
    setCards([]);
    setCardTx([]);
    setCart([]);
  }, [setCards, setCardTx, setClients, setProducts, setSales]);

  // ---- alertes dérivées
  const alerts = useMemo(() => {
    const out: { id: string; kind: "rupture" | "low" | "debt"; text: string }[] = [];
    for (const p of products) {
      if (p.stock === 0)
        out.push({ id: `a-${p.id}`, kind: "rupture", text: `Rupture : ${p.name}` });
      else if (p.stock <= 5)
        out.push({
          id: `a-${p.id}`,
          kind: "low",
          text: `Stock bas : ${p.name} (${p.stock} restants)`,
        });
    }
    for (const c of clients) {
      if (c.debtDh > 0 && daysSince(c.since) > 30)
        out.push({
          id: `a-${c.id}`,
          kind: "debt",
          text: `${c.name} — ${fmtDh(c.debtDh)} en retard de ${daysSince(c.since)}j`,
        });
    }
    return out;
  }, [products, clients]);

  return {
    products,
    clients,
    sales,
    cart,
    cartTotal,
    ticketNo,
    alerts,
    cards,
    cardTx,
    productById,
    addToCart,
    setQty,
    clearCart,
    checkout,
    voidSale,
    payDebt,
    addClient,
    addDebt,
    updateClient,
    adjustStock,
    updateProduct,
    addProduct,
    removeProduct,
    addCard,
    findCardByCode,
    topUpCard,
    payWithCard,
    checkoutWithCard,
    updateCard,
    cardTxFor,
    resetAll,
  };
}

export type Store = ReturnType<typeof useStore>;

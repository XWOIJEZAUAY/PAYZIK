/** Outils function-calling de la session Live (panier, kridi, encaissement).
 *  Partagés par l'écran caisse — les retours s'affichent dans le GRAND fil de l'agent. */
import { matchProducts } from "./index";
import { daysSince, fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";

export type ToolProductRef = { productId: string; qty: number };
export type ToolOutcome = {
  data: Record<string, unknown>;
  message?: string;
  products?: ToolProductRef[];
};

export function createLiveToolHandlers(getStore: () => Store) {
  const findClient = (name: string) => {
    const q = name.toLowerCase().trim();
    const cs = getStore().clients;
    return (
      cs.find((c) => c.name.toLowerCase() === q) ??
      cs.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
    );
  };

  const findCardByArg = (args: Record<string, unknown>) => {
    const q = String(args.code || args.card || args.name || "")
      .trim()
      .toUpperCase();
    if (!q) return undefined;
    const cs = getStore().cards;
    return (
      cs.find((c) => c.code.toUpperCase() === q) ??
      cs.find((c) => c.name.toUpperCase() === q) ??
      cs.find((c) => c.name.toUpperCase().includes(q))
    );
  };

  const handlers: Record<string, (args: Record<string, unknown>) => ToolOutcome> = {
    addProduct: (args) => {
      const name = String(args.name ?? "");
      const qty = Math.max(1, Number(args.qty) || 1);
      const cur = getStore();
      const matched = matchProducts([{ name, qty }], cur.products);
      if (!matched.length)
        return {
          data: { ok: false, error: `produit inconnu: ${name}` },
          message: `Produit inconnu : ${name}`,
        };
      for (const m of matched) cur.addToCart(m.product.id, m.qty);
      return {
        data: {
          ok: true,
          added: matched.map((m) => ({ name: m.product.name, qty: m.qty })),
          cartTotal: cur.cartTotal,
        },
        message: `${matched.map((m) => `${m.qty} × ${m.product.name}`).join(", ")} ajouté`,
        products: matched.map((m) => ({ productId: m.product.id, qty: m.qty })),
      };
    },
    removeProduct: (args) => {
      const cur = getStore();
      const name = String(args.name ?? "");
      const matched = matchProducts([{ name, qty: 1 }], cur.products);
      if (!matched.length)
        return {
          data: { ok: false, error: `produit inconnu: ${name}` },
          message: `Produit inconnu : ${name}`,
        };
      const pid = matched[0].product.id;
      const line = cur.cart.find((l) => l.productId === pid);
      if (!line)
        return {
          data: { ok: false },
          message: `${matched[0].product.name} n'est pas au panier`,
        };
      const removeQty = args.qty != null ? Math.max(1, Number(args.qty) || 1) : line.qty;
      cur.setQty(pid, Math.max(0, line.qty - removeQty));
      return {
        data: { ok: true, cartTotal: cur.cartTotal },
        message: `${Math.min(removeQty, line.qty)} × ${matched[0].product.name} retiré`,
        products: [{ productId: pid, qty: Math.max(0, line.qty - removeQty) }],
      };
    },
    getStock: () => {
      const cur = getStore();
      const items = cur.products.map((p) => ({
        name: p.name,
        stock: p.stock,
        low: p.stock > 0 && p.stock <= 5,
        out: p.stock <= 0,
      }));
      const low = items.filter((i) => i.low || i.out);
      return {
        data: { ok: true, items, lowCount: low.length },
        message: low.length
          ? `Stock bas/rupture (${low.length}) : ${low.map((i) => `${i.name} (${i.stock})`).join(", ")}`
          : `Stock OK pour ${items.length} produits`,
        products: low.length ? low.map((i) => ({ productId: cur.products.find((p) => p.name === i.name)!.id, qty: 0 })) : undefined,
      };
    },
    getCards: () => {
      const cur = getStore();
      const list = cur.cards.map((c) => ({ name: c.name, code: c.code, balanceDh: c.balanceDh }));
      const total = list.reduce((s, c) => s + c.balanceDh, 0);
      return {
        data: { ok: true, cards: list, totalDh: total },
        message: list.length
          ? `Cartes (${list.length}) : ${list.map((c) => `${c.name} ${c.balanceDh} DH`).join(", ")} — total ${total} DH`
          : "Aucune carte enregistrée",
      };
    },
    /** Carte précise : solde + derniers mouvements (vérification base de données). */
    findCard: (args) => {
      const cur = getStore();
      const card = findCardByArg(args);
      if (!card)
        return {
          data: { ok: false, error: "carte introuvable" },
          message: "Cette carte n'est pas valide — elle n'existe pas dans la base.",
        };
      const txs = cur
        .cardTxFor(card.id)
        .slice(0, 5)
        .map((t) => `${t.type === "topup" ? "+" : "-"}${fmtDh(t.amountDh)} (${t.label})`);
      return {
        data: {
          ok: true,
          code: card.code,
          name: card.name,
          balanceDh: card.balanceDh,
          transactions: txs,
        },
        message: `Carte ${card.name} (${card.code}) : ${fmtDh(card.balanceDh)} disponibles${
          txs.length ? ` — mouvements : ${txs.join(", ")}` : ""
        }.`,
      };
    },
    topUpCard: (args) => {
      const cur = getStore();
      const card = findCardByArg(args);
      if (!card)
        return {
          data: { ok: false, error: "carte introuvable" },
          message: "Cette carte n'est pas valide — elle n'existe pas dans la base.",
        };
      const amountDh = Math.max(0, Number(args.amountDh) || 0);
      if (!amountDh)
        return {
          data: { ok: false, needAmount: true },
          message: `Combien veux-tu recharger sur la carte de ${card.name} ?`,
        };
      cur.topUpCard(card.id, amountDh, "Recharge via PAYZIK IA");
      return {
        data: { ok: true, name: card.name, addedDh: amountDh, balanceDh: card.balanceDh + amountDh },
        message: `Recharge ${fmtDh(amountDh)} sur ${card.name} — solde ${fmtDh(card.balanceDh + amountDh)}.`,
      };
    },
    /** Paiement du panier par carte rechargeable : code/QR obligatoire. */
    payWithCard: (args) => {
      const cur = getStore();
      const card = findCardByArg(args);
      if (!card)
        return {
          data: { ok: false, error: "carte introuvable" },
          message: "Cette carte n'est pas valide — scan son QR ou donne son code.",
        };
      if (cur.cart.length === 0)
        return { data: { ok: false, error: "panier vide" }, message: "Panier vide, rien à payer" };
      const sale = cur.checkoutWithCard(card.id);
      if (!sale)
        return {
          data: { ok: false, error: "solde insuffisant" },
          message: `Solde insuffisant sur ${card.name} (${fmtDh(card.balanceDh)} pour ${fmtDh(cur.cartTotal)}).`,
        };
      return {
        data: {
          ok: true,
          ticket: sale.ticketNo,
          totalDh: sale.totalDh,
          remainingDh: card.balanceDh - sale.totalDh,
        },
        message: `Ticket #${sale.ticketNo} — ${fmtDh(sale.totalDh)} payés par carte ${card.name}, reste ${fmtDh(card.balanceDh - sale.totalDh)}.`,
      };
    },
    getSales: () => {
      const cur = getStore();
      const today = new Date().toDateString();
      const sales = cur.sales.filter((s) => new Date(s.date).toDateString() === today);
      const total = sales.reduce((sum, s) => sum + s.totalDh, 0);
      return {
        data: {
          ok: true,
          count: sales.length,
          totalDh: total,
          last: sales.slice(0, 5).map((s) => ({ ticket: s.ticketNo, totalDh: s.totalDh, method: s.method })),
        },
        message: sales.length
          ? `Aujourd'hui : ${sales.length} vente${sales.length > 1 ? "s" : ""}, ${fmtDh(total)} — derniers tickets ${sales
              .slice(0, 5)
              .map((s) => `#${s.ticketNo} ${fmtDh(s.totalDh)}`)
              .join(", ")}.`
          : "Aucune vente enregistrée aujourd'hui.",
      };
    },
    getCatalog: () => {
      const cur = getStore();
      return {
        data: {
          ok: true,
          products: cur.products.map((p) => ({ name: p.name, priceDh: p.priceDh, stock: p.stock })),
        },
        message: `Catalogue (${cur.products.length}) : ${cur.products
          .slice(0, 30)
          .map((p) => `${p.name} ${fmtDh(p.priceDh)} (${p.stock})`)
          .join(", ")}.`,
      };
    },
    setStock: (args) => {
      const cur = getStore();
      const matched = matchProducts([{ name: String(args.name ?? ""), qty: 1 }], cur.products);
      if (!matched.length)
        return { data: { ok: false }, message: `Produit inconnu : ${args.name ?? "?"}` };
      const p = matched[0].product;
      if (args.qty != null) cur.updateProduct(p.id, { stock: Math.max(0, Number(args.qty) || 0) });
      else cur.adjustStock(p.id, Number(args.delta) || 0);
      const stock = cur.productById(p.id)?.stock ?? p.stock;
      return { data: { ok: true, name: p.name, stock }, message: `Stock ${p.name} : ${stock} unités.` };
    },
    setPrice: (args) => {
      const cur = getStore();
      const matched = matchProducts([{ name: String(args.name ?? ""), qty: 1 }], cur.products);
      if (!matched.length)
        return { data: { ok: false }, message: `Produit inconnu : ${args.name ?? "?"}` };
      const priceDh = Math.max(0, Number(args.priceDh ?? args.price) || 0);
      if (!priceDh) return { data: { ok: false, needPrice: true }, message: "Quel est le nouveau prix ?" };
      const p = matched[0].product;
      cur.updateProduct(p.id, { priceDh });
      return {
        data: { ok: true, name: p.name, priceDh },
        message: `Prix de ${p.name} mis à jour : ${fmtDh(priceDh)}.`,
      };
    },
    addCatalogProduct: (args) => {
      const cur = getStore();
      const name = String(args.name ?? "").trim();
      const priceDh = Math.max(0, Number(args.priceDh ?? args.price) || 0);
      if (!name || !priceDh)
        return {
          data: { ok: false, needNameOrPrice: true },
          message: "Il me manque le nom et le prix du nouveau produit.",
        };
      cur.addProduct({
        name,
        priceDh,
        stock: Math.max(0, Number(args.stock) || 0),
        category: "Épicerie",
        emoji: "🧺",
        aliases: [name.toLowerCase()],
      });
      return {
        data: { ok: true, name, priceDh },
        message: `${name} ajouté au catalogue à ${fmtDh(priceDh)}.`,
      };
    },
    getCart: () => {
      const cur = getStore();
      const chips = cur.cart.map((l) => {
        const p = cur.productById(l.productId);
        return { name: p?.name ?? l.productId, qty: l.qty, productId: l.productId };
      });
      return {
        data: {
          ok: true,
          items: chips.map((c) => ({ name: c.name, qty: c.qty })),
          totalDh: cur.cartTotal,
        },
        message: chips.length
          ? `Panier : ${chips.map((c) => `${c.qty} × ${c.name}`).join(", ")} = ${fmtDh(cur.cartTotal)}`
          : "Panier vide",
        products: chips.length
          ? chips.map((c) => ({ productId: c.productId, qty: c.qty }))
          : undefined,
      };
    },
    checkout: (args) => {
      const cur = getStore();
      const raw = String(args.method ?? "cash");
      const method = raw === "card" || raw === "wallet" ? "card" : raw === "kridi" ? "kridi" : "cash";
      // Carte = carte PAYZIK rechargeable : QR/code obligatoire + solde vérifié.
      if (method === "card") {
        const card = findCardByArg(args);
        if (!card)
          return {
            data: { ok: false, needCard: true },
            message: "Pour payer par carte, scan le QR ou donne le code de la carte.",
          };
        if (cur.cart.length === 0)
          return { data: { ok: false, error: "panier vide" }, message: "Panier vide, rien à encaisser" };
        const sale = cur.checkoutWithCard(card.id);
        if (!sale)
          return {
            data: { ok: false, error: "solde insuffisant" },
            message: `Cette carte n'est pas valide ou son solde est insuffisant (${fmtDh(card.balanceDh)}).`,
          };
        return {
          data: { ok: true, ticket: sale.ticketNo, totalDh: sale.totalDh, method: "wallet" },
          message: `Ticket #${sale.ticketNo} — ${fmtDh(sale.totalDh)} payés par carte ${card.name}, reste ${fmtDh(card.balanceDh - sale.totalDh)}.`,
        };
      }
      let clientId: string | undefined;
      let clientName: string | undefined;
      if (method === "kridi") {
        const cl = findClient(String(args.client ?? ""));
        if (!cl)
          return {
            data: { ok: false, error: "client inconnu" },
            message: `Client inconnu : ${args.client ?? "?"} — précise un nom du carnet de crédit`,
          };
        clientId = cl.id;
        clientName = cl.name;
      }
      const sale = cur.checkout(method, clientId);
      if (!sale)
        return { data: { ok: false, error: "panier vide" }, message: "Panier vide, rien à encaisser" };
      const label = method === "kridi" ? `kridi ${clientName}` : "espèces";
      return {
        data: { ok: true, ticket: sale.ticketNo, totalDh: sale.totalDh, method },
        message: `Ticket #${sale.ticketNo} — ${fmtDh(sale.totalDh)} (${label}) encaissé ✓`,
      };
    },
    getDebts: () => {
      const cs = getStore()
        .clients.filter((c) => c.debtDh > 0)
        .sort((a, b) => b.debtDh - a.debtDh);
      const list = cs.map((c) => ({ name: c.name, debtDh: c.debtDh, days: daysSince(c.since) }));
      const total = list.reduce((sum, c) => sum + c.debtDh, 0);
      return {
        data: { ok: true, clients: list, totalDh: total },
        message: list.length
          ? `Kridi (${fmtDh(total)}) : ${list
              .map((c) => `${c.name} ${fmtDh(c.debtDh)} — ${c.days} j`)
              .join(", ")}`
          : "Aucun crédit en cours",
      };
    },
    getClientDebt: (args) => {
      const cl = findClient(String(args.name ?? ""));
      if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
      return {
        data: {
          ok: true,
          name: cl.name,
          debtDh: cl.debtDh,
          days: daysSince(cl.since),
          phone: cl.phone,
          note: cl.note,
        },
        message: `${cl.name} : ${fmtDh(cl.debtDh)} de crédit (depuis ${daysSince(cl.since)} j)${
          cl.phone ? ` — ☎ ${cl.phone}` : ""
        }`,
      };
    },
    getClientHistory: (args) => {
      const cl = findClient(String(args.name ?? ""));
      if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
      const bought = cl.history.flatMap((h) => h.items ?? []);
      const detail = bought.length
        ? bought.map((it) => `${it.qty} × ${it.name}`).join(", ")
        : "aucun produit détaillé";
      return {
        data: { ok: true, name: cl.name, debtDh: cl.debtDh },
        message: bought.length
          ? `Achats à crédit de ${cl.name} : ${detail}`
          : `${cl.name} — pas de détail des produits enregistré`,
      };
    },
    addDebt: (args) => {
      const cur = getStore();
      const name = String(args.name ?? "").trim();
      if (!name) return { data: { ok: false }, message: "Nom du client manquant" };
      const rawItems = Array.isArray(args.items)
        ? (args.items as { name?: unknown; qty?: unknown }[])
        : [];
      const matched = rawItems.length
        ? matchProducts(
            rawItems.map((it) => ({
              name: String(it.name ?? ""),
              qty: Math.max(1, Number(it.qty) || 1),
            })),
            cur.products,
          )
        : [];
      const items = matched.map((m) => ({
        name: m.product.name,
        qty: m.qty,
        priceDh: m.product.priceDh,
      }));
      const itemsTotal = items.reduce((sum, it) => sum + it.priceDh * it.qty, 0);
      const givenAmount = Math.max(0, Number(args.amountDh) || 0);
      const amountDh = givenAmount || itemsTotal;
      if (!amountDh)
        return {
          data: { ok: false, needItems: true },
          message: `Il manque le montant et le produit — demande ce que ${name} a pris`,
        };
      let cl = findClient(name);
      if (!cl) cl = cur.addClient(name);
      const label =
        String(args.note ?? "").trim() ||
        (items.length ? items.map((it) => `${it.qty}× ${it.name}`).join(", ") : "Achat à crédit");
      cur.addDebt(cl.id, amountDh, label, items.length ? items : undefined);
      return {
        data: {
          ok: true,
          name: cl.name,
          addedDh: amountDh,
          newDebtDh: cl.debtDh + amountDh,
          items: items.map((it) => ({ name: it.name, qty: it.qty })),
        },
        message: `${cl.name} : +${fmtDh(amountDh)} au kridi${
          items.length ? ` (${items.map((it) => `${it.qty} × ${it.name}`).join(", ")})` : ""
        } — total ${fmtDh(cl.debtDh + amountDh)}`,
        products: matched.map((m) => ({ productId: m.product.id, qty: m.qty })),
      };
    },
    payDebt: (args) => {
      const cur = getStore();
      const cl = findClient(String(args.name ?? ""));
      if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
      const amountDh = Math.max(0, Number(args.amountDh) || 0);
      if (!amountDh) return { data: { ok: false }, message: "Montant payé manquant" };
      cur.payDebt(cl.id, amountDh);
      const remaining = Math.max(0, cl.debtDh - amountDh);
      return {
        data: { ok: true, name: cl.name, paidDh: amountDh, remainingDh: remaining },
        message: `${cl.name} a payé ${fmtDh(amountDh)} — reste ${fmtDh(remaining)}`,
      };
    },
    updateClient: (args) => {
      const cur = getStore();
      const name = String(args.name ?? "").trim();
      if (!name) return { data: { ok: false }, message: "Nom du client manquant" };
      let cl = findClient(name);
      if (!cl) cl = cur.addClient(name);
      const patch: { name?: string; phone?: string; note?: string } = {};
      if (args.newName) patch.name = String(args.newName).trim();
      if (args.phone) patch.phone = String(args.phone).trim();
      if (args.note) patch.note = String(args.note).trim();
      if (!Object.keys(patch).length)
        return { data: { ok: false }, message: "Rien à modifier (nom, téléphone ou note ?)" };
      cur.updateClient(cl.id, patch);
      const parts = [
        patch.name ? `ism -> ${patch.name}` : "",
        patch.phone ? `tilifun ${patch.phone}` : "",
        patch.note ? `note : ${patch.note}` : "",
      ].filter(Boolean);
      return {
        data: { ok: true, name: patch.name ?? cl.name, updated: patch },
        message: `${cl.name} : ${parts.join(" · ")}`,
      };
    },
  };

  return handlers;
}

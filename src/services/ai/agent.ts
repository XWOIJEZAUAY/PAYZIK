/** IA texte "agent" : les mêmes outils que Gemini Live, accessibles en écriture.
 *  Elle lit les données réelles (stock, cartes, kridi, ventes) et peut les modifier.
 *  Le routeur reconnaît la darija et le français ; Gemini reste utilisé pour
 *  la dictée libre des commandes de produits. */
import type { Store } from "../../state/store";
import { createLiveToolHandlers, type ToolOutcome } from "./liveTools";

const numberIn = (text: string) => {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:dh|derhem|drhm)?/i);
  return m ? Number(m[1].replace(",", ".")) : 0;
};

export function runAgentText(text: string, getStore: () => Store): ToolOutcome | null {
  const raw = text.trim();
  const q = raw.toLowerCase();
  if (!q) return null;
  const store = getStore();
  const h = createLiveToolHandlers(getStore);

  const code = raw.match(/PZK-[A-Z0-9-]{4,}/i)?.[0] ?? "";
  const product = store.products.find(
    (p) =>
      q.includes(p.name.toLowerCase()) ||
      p.aliases.some((a) => q.includes(a.toLowerCase())),
  );
  const client = store.clients.find((c) => q.includes(c.name.toLowerCase()));

  // Paiement / recharge par carte : QR ou code obligatoire, solde vérifié en base.
  if (/\b(recharge|recharger|zid.*flous|top ?up)\b/.test(q) && /(carte|kart)/.test(q)) {
    return h.topUpCard({ code, name: client?.name, amountDh: numberIn(q) });
  }
  if (
    /(paie|payer|payé|khelles|khalas|encaisse|safi).*(carte|kart)|(carte|kart).*(paie|payer|khelles|khalas)/.test(q)
  ) {
    return h.payWithCard({ code, name: code ? undefined : client?.name });
  }
  if (/(solde|balance|ch7al 3endna|combien).*(carte|kart)/.test(q) && code)
    return h.findCard({ code });
  if (/(carte|kart)/.test(q) && /(nouvelle|cr[eé]er|create)/.test(q)) return null;

  // Modifications du catalogue.
  if (/(prix|price|s3r|beddel.*prix|change.*prix)/.test(q) && product && numberIn(q)) {
    return h.setPrice({ name: product.name, priceDh: numberIn(q) });
  }
  if (/(stock|stok|kmiya|quantit[ée])/.test(q) && product && numberIn(q)) {
    if (/(zid|ajoute|augmente|\+)/.test(q))
      return h.setStock({ name: product.name, delta: numberIn(q) });
    if (/(naqqs|nqss|retire|enl[eè]ve|-)/.test(q))
      return h.setStock({ name: product.name, delta: -numberIn(q) });
    return h.setStock({ name: product.name, qty: numberIn(q) });
  }
  if (/(ajoute|zid|nouveau|jdid).*(produit|product)/.test(q)) {
    const name = raw.match(/(?:produit|product)\s+([^\d,]+)/i)?.[1]?.trim();
    if (name) return h.addCatalogProduct({ name, priceDh: numberIn(q), stock: numberIn(q) || 0 });
  }

  // Lectures : ventes, catalogue, stock, kridi, cartes.
  if (/(ventes|mbya3at|bilan|ch7al khda lyoum|ca du jour|chiffre d'affaires)/.test(q))
    return h.getSales({});
  if (/(catalogue|lkitab|tous les produits)/.test(q)) return h.getCatalog({});
  if (/(stock|stok|rupture|manque|qrib ykmel|3endna.*(produit|kmiya))/.test(q))
    return h.getStock({});
  if (/(kridi|kredit|dette|3lih|chkoun.*kridi)/.test(q)) {
    if (client) return h.getClientDebt({ name: client.name });
    return h.getDebts({});
  }
  if (/(carte|kart)/.test(q)) {
    if (code) return h.findCard({ code });
    return h.getCards({});
  }
  return null;
}

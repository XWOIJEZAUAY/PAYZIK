/** Catalogue réel + assistant de commande côté client. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Package,
  Search,
  Send,
  Sparkles,
  Store,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { getSupabaseClient } from "../../services/auth";
import {
  listPublicProducts,
  listShops,
  type CloudProduct,
  type Shop,
} from "../../services/backend/payzikCards";
import {
  createPrepOrder,
  listClientOrders,
  type PrepItem,
  type PrepOrder,
} from "../../services/backend/payzikOrders";
import { fmtDh } from "../../lib/format";
import { shortReply } from "../../services/ai/shortReply";
import { getClientSpending, type SpendingSummary } from "../../services/backend/payzikSpending";
import type { Profile } from "../../services/auth";

type Msg = {
  id: string;
  role: "ai" | "user";
  text: string;
  kind?: "error" | "success";
};

const STATUS: Record<
  PrepOrder["status"],
  { label: string; cls: string; icon: LucideIcon }
> = {
  pending: { label: "En cours", cls: "bg-amber-50 text-amber-700", icon: Clock3 },
  confirmed: { label: "En préparation", cls: "bg-[#E9E6F5] text-[#433874]", icon: CheckCircle2 },
  ready: { label: "Prêt", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Annulée", cls: "bg-rose-50 text-rose-600", icon: XCircle },
};

const norm = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function matchProduct(
  chunk: string,
  products: CloudProduct[],
): { product: CloudProduct; qty: number } | null {
  const text = norm(chunk);
  const q = text.match(/(\d+)\s*(?:x|×)?\s*/);
  const qty = q ? Math.min(Number(q[1]), 99) : 1;
  const sorted = [...products].sort(
    (a, b) => norm(b.name).length - norm(a.name).length,
  );
  for (const p of sorted) {
    const names = [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])];
    for (const raw of names) {
      const alias = norm(String(raw));
      if (alias.length >= 2 && text.includes(alias)) return { product: p, qty };
    }
  }
  return null;
}

/** Retrouve un produit réel dans une question du type « qui vend du lait ? ». */
function productFromText(text: string, products: CloudProduct[]): CloudProduct | null {
  const needle = norm(text);
  const sorted = [...products].sort((a, b) => norm(b.name).length - norm(a.name).length);
  for (const p of sorted) {
    const names = [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])];
    if (names.some((n) => norm(String(n)).length >= 3 && needle.includes(norm(String(n))))) {
      return p;
    }
  }
  return null;
}

function parseRequest(
  text: string,
  products: CloudProduct[],
  shops: Shop[],
  selectedShopId: string,
): { shopId: string; items: PrepItem[]; note: string } | { error: string } {
  const lower = norm(text);
  let shopId = selectedShopId;
  for (const s of shops) {
    if (lower.includes(norm(s.shop_name))) {
      shopId = s.id;
      break;
    }
  }

  const scope = shopId ? products.filter((p) => p.shop_id === shopId) : products;
  if (shopId && scope.length === 0) {
    return { error: "Pas encore de produits dans cette boutique." };
  }

  const chunks = text
    .split(/[,;]|\s+et\s+|\s+then\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const merged = new Map<string, PrepItem>();
  for (const chunk of chunks) {
    const hit = matchProduct(chunk, scope);
    if (!hit) continue;
    const prev = merged.get(hit.product.id);
    merged.set(hit.product.id, {
      product_id: hit.product.id,
      name: hit.product.name,
      qty: (prev?.qty ?? 0) + hit.qty,
      priceDh: hit.product.price_dh,
    });
  }
  const items = [...merged.values()];
  if (!items.length) {
    return { error: "Produit introuvé dans le catalogue." };
  }

  if (!shopId) {
    const ids = new Set(
      items.map((i) => products.find((p) => p.id === i.product_id)?.shop_id).filter(Boolean),
    );
    if (ids.size !== 1) {
      return { error: "Choisis la boutique." };
    }
    shopId = [...ids][0] as string;
  }

  return { shopId, items, note: text };
}

export function ClientCatalog({
  user,
  notify,
  initialShopId = "",
}: {
  user: Profile;
  notify: (m: string) => void;
  initialShopId?: string;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState(initialShopId);
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: "welcome", role: "ai", text: "Dis-moi ce qu'il te faut." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshOrders = async () => {
    const res = await listClientOrders();
    if (res.ok) setOrders(res.data);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, p, o, sp] = await Promise.all([
        listShops(),
        listPublicProducts(),
        listClientOrders(),
        getClientSpending(),
      ]);
      if (!alive) return;
      if (s.ok) {
        setShops(s.data);
        if (s.data.length) setShopId((cur) => cur || s.data[0].id);
      }
      if (p.ok) setProducts(p.data);
      if (o.ok) setOrders(o.data);
      if (sp.ok) setSpending(sp.data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (initialShopId) setShopId(initialShopId);
  }, [initialShopId]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`client-orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prep_orders",
          filter: `client_id=eq.${user.id}`,
        },
        (payload) => {
          void refreshOrders();
          if (payload.eventType === "UPDATE") {
            const status = (payload.new as { status?: string })?.status;
            if (status === "confirmed") notify("En préparation.");
            if (status === "ready") notify("Prêt.");
          }
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs]);

  const visible = useMemo(() => {
    const needle = norm(q);
    return products.filter((p) => {
      const okShop = !shopId || p.shop_id === shopId;
      const okQ =
        !needle ||
        norm(p.name).includes(needle) ||
        (p.aliases ?? []).some((a) => norm(a).includes(needle));
      return okShop && okQ;
    });
  }, [products, q, shopId]);

  const shopName = (id: string) => shops.find((s) => s.id === id)?.shop_name ?? "Boutique";

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    setBusy(true);
    setMsgs((m) => [...m, { id: `${Date.now()}-u`, role: "user", text: value }]);

    const lower = norm(value);

    // Dépenses / portefeuille : on répond uniquement avec le ledger réel.
    if (/(depense|depenses|portefeuille|budget|analyse)/.test(lower)) {
      const amount = spending?.spentMonth ?? 0;
      const local = `Tu as dépensé ${fmtDh(amount)} ce mois.`;
      const reply = await shortReply(local, `Dépenses du mois : ${amount} DH.`);
      setMsgs((m) => [...m, { id: `${Date.now()}-a`, role: "ai", text: reply }]);
      setBusy(false);
      return;
    }

    // Recherche d'une boutique qui vend un produit réellement enregistré.
    if (/(qui vend|ou vend|cherche|trouve|vend|disponible)/.test(lower) && !/^\s*\d/.test(value)) {
      let local = "Je ne vois pas ce produit.";
      const hit = productFromText(value, products);
      if (hit) {
        const names = shops.filter((s) => s.id === hit.shop_id).map((s) => s.shop_name);
        local = names.length
          ? `${hit.name} : ${names.join(", ")}.`
          : `${hit.name} : aucune boutique réelle référencée.`;
      }
      const reply = await shortReply(local, `Question : ${value}`);
      setMsgs((m) => [...m, { id: `${Date.now()}-a`, role: "ai", text: reply }]);
      setBusy(false);
      return;
    }

    const parsed = parseRequest(value, products, shops, shopId);
    if ("error" in parsed) {
      setMsgs((m) => [
        ...m,
        { id: `${Date.now()}-a`, role: "ai", text: parsed.error, kind: "error" },
      ]);
      setBusy(false);
      return;
    }

    const res = await createPrepOrder(parsed.shopId, parsed.items, parsed.note);
    if (!res.ok) {
      setMsgs((m) => [
        ...m,
        { id: `${Date.now()}-a`, role: "ai", text: "Envoi impossible.", kind: "error" },
      ]);
      setBusy(false);
      return;
    }

    const recap = parsed.items.map((i) => `${i.qty} × ${i.name}`).join(" · ");
    const local = `Envoyé à ${shopName(parsed.shopId)} · ${recap}.`;
    const reply = await shortReply(local, `Commande envoyée : ${recap}`);
    setMsgs((m) => [
      ...m,
      {
        id: `${Date.now()}-a`,
        role: "ai",
        text: reply,
        kind: "success",
      },
    ]);
    notify("Commande envoyée.");
    await refreshOrders();
    setBusy(false);
  };

  return (
    <div className="animate-fade-up space-y-2.5">
      <section className="rounded-xl border border-[#DFD9EF] bg-white p-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E9E6F5] text-[#433874]">
            <Store size={16} />
          </span>
          <h2 className="text-[13px] font-bold text-[#2E2659]">Boutiques</h2>
        </div>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="mt-2.5 h-9 w-full rounded-lg border border-[#DFD9EF] bg-[#F7F5FC] px-2.5 text-[11px] font-semibold text-[#2E2659] outline-none focus:border-[#433874]"
        >
          <option value="">Toutes les boutiques</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.shop_name}</option>
          ))}
        </select>
        <div className="relative mt-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7DB0]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un produit (lait, pain…)"
            className="h-9 w-full rounded-lg border border-[#DFD9EF] bg-[#F7F5FC] pl-8 pr-2.5 text-[11px] outline-none focus:border-[#433874]"
          />
        </div>

        {loading ? (
          <p className="mt-3 text-[11px] text-slate-400">Un instant…</p>
        ) : visible.length === 0 ? (
          <div className="mt-3 rounded-xl bg-[#E9E6F5] p-3 text-[11px] text-[#433874]">
            Aucun produit pour l’instant.
          </div>
        ) : (
          <div className="mt-2.5 max-h-40 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setShopId(p.shop_id ?? shopId);
                  setText((t) => `${t}${t ? " " : ""}1 ${p.name}`);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[#DFD9EF] bg-white p-2 text-left transition active:scale-[.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#E9E6F5] text-lg">
                  {p.image ? (
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    p.emoji ?? <Package size={16} className="text-[#433874]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-[#2E2659]">{p.name}</span>
                  <span className="block truncate text-[10px] text-[#6B6389]">
                    {shopName(p.shop_id ?? "")} · stock {p.stock}
                  </span>
                </span>
                <span className="font-mono text-[11px] font-bold text-[#433874]">{fmtDh(p.price_dh)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#DFD9EF] bg-white">
        <div className="flex items-center gap-2 border-b border-[#DFD9EF] bg-[#FFF7F2] px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#433874] text-white">
            <Bot size={14} />
          </span>
          <p className="text-[12px] font-bold text-[#2E2659]">Message</p>
          <Sparkles size={13} className="ml-auto text-[#8A6EDD]" />
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto scrollbar-thin p-2.5">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-2.5 py-1.5 text-[11.5px] leading-snug ${
                  m.role === "user"
                    ? "rounded-br-md bg-[#433874] text-white"
                    : m.kind === "error"
                      ? "rounded-bl-md bg-rose-50 text-rose-700"
                      : m.kind === "success"
                        ? "rounded-bl-md bg-emerald-50 text-emerald-800"
                        : "rounded-bl-md bg-[#F1F5F9] text-[#2E2659]"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <p className="text-[10.5px] font-semibold text-[#433874]">…</p>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-1.5 border-t border-[#DFD9EF] p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            placeholder="2 lait et 1 pain…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[#DFD9EF] bg-[#F7F5FC] px-2.5 text-[11px] outline-none focus:border-[#433874]"
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#433874] text-white disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[#DFD9EF] bg-white p-3.5">
        <h2 className="text-[12px] font-bold text-[#2E2659]">Suivi des commandes</h2>
        {orders.length === 0 ? (
          <p className="mt-1.5 text-[10.5px] text-slate-500">Aucune commande.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {orders.map((o) => {
              const s = STATUS[o.status];
              const Icon = s.icon;
              return (
                <div key={o.id} className="rounded-xl border border-[#DFD9EF] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] font-bold text-[#2E2659]">
                      {shopName(o.shop_id)}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${s.cls}`}>
                      <Icon size={11} /> {s.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#6B6389]">
                    {o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                  </p>
                  <p className="mt-1 text-[9.5px] text-[#8A7DB0]">
                    {new Date(o.created_at).toLocaleString("fr-MA")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

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
  pending: { label: "Envoyée au commerçant", cls: "bg-amber-50 text-amber-700", icon: Clock3 },
  confirmed: { label: "Préparation confirmée", cls: "bg-[#FFF1EA] text-[#FF5200]", icon: CheckCircle2 },
  ready: { label: "Prête — tu peux passer", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
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
    return { error: "Aucun produit réel n’est enregistré dans cette boutique pour le moment." };
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
    return {
      error:
        "Je n’ai trouvé aucun de ces produits dans le catalogue réel. Clique sur un produit ci-dessus pour l’ajouter à ta demande.",
    };
  }

  if (!shopId) {
    const ids = new Set(
      items.map((i) => products.find((p) => p.id === i.product_id)?.shop_id).filter(Boolean),
    );
    if (ids.size !== 1) {
      return { error: "Choisis la boutique dans la liste avant d’envoyer la commande." };
    }
    shopId = [...ids][0] as string;
  }

  return { shopId, items, note: text };
}

export function ClientCatalog({
  user,
  notify,
}: {
  user: Profile;
  notify: (m: string) => void;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "welcome",
      role: "ai",
      text: "Salam ! Je suis l’assistant PAYZIK. Choisis une boutique, puis dis-moi par exemple : « prépare-moi 2 lait et 1 pain, j’arrive bientôt ». Je vérifie le catalogue réel et j’envoie la commande au commerçant.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshOrders = async () => {
    const res = await listClientOrders();
    if (res.ok) setOrders(res.data);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, p, o] = await Promise.all([
        listShops(),
        listPublicProducts(),
        listClientOrders(),
      ]);
      if (!alive) return;
      if (s.ok) {
        setShops(s.data);
        if (s.data.length) setShopId((cur) => cur || s.data[0].id);
      }
      if (p.ok) setProducts(p.data);
      if (o.ok) setOrders(o.data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

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
            if (status === "confirmed") notify("Le commerçant a confirmé ta préparation.");
            if (status === "ready") notify("Ta commande est prête !");
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
        { id: `${Date.now()}-a`, role: "ai", text: `Envoi impossible : ${res.error}`, kind: "error" },
      ]);
      setBusy(false);
      return;
    }

    const recap = parsed.items.map((i) => `${i.qty} × ${i.name}`).join(" · ");
    setMsgs((m) => [
      ...m,
      {
        id: `${Date.now()}-a`,
        role: "ai",
        text: `Commande envoyée à ${shopName(parsed.shopId)} : ${recap}. Le commerçant reçoit la notification et je te préviens dès qu’il confirme.`,
        kind: "success",
      },
    ]);
    notify(`Commande envoyée à ${shopName(parsed.shopId)}.`);
    await refreshOrders();
    setBusy(false);
  };

  return (
    <div className="animate-fade-up space-y-3">
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF1EA] text-[#FF5200]">
            <Store size={18} />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-[#0F172A]">Catalogue réel</h2>
            <p className="text-[11px] text-[#64748B]">Produits enregistrés par les boutiques.</p>
          </div>
        </div>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="mt-3 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#FF5200]"
        >
          <option value="">Toutes les boutiques</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.shop_name}</option>
          ))}
        </select>
        <div className="relative mt-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un produit (lait, pain…)"
            className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-[12px] outline-none focus:border-[#FF5200]"
          />
        </div>

        {loading ? (
          <p className="mt-3 text-[11px] text-slate-400">Chargement du catalogue…</p>
        ) : visible.length === 0 ? (
          <div className="mt-3 rounded-xl bg-[#FFF1EA] p-3 text-[11px] text-[#9A3412]">
            Aucun produit réel dans cette boutique pour l’instant.
          </div>
        ) : (
          <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setShopId(p.shop_id ?? shopId);
                  setText((t) => `${t}${t ? " " : ""}1 ${p.name}`);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white p-2 text-left transition active:scale-[.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#FFF1EA] text-lg">
                  {p.image ? (
                    <img src={p.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    p.emoji ?? <Package size={16} className="text-[#FF5200]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-[#0F172A]">{p.name}</span>
                  <span className="block truncate text-[10px] text-[#64748B]">
                    {shopName(p.shop_id ?? "")} · stock {p.stock}
                  </span>
                </span>
                <span className="font-mono text-[11px] font-bold text-[#FF5200]">{fmtDh(p.price_dh)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] bg-[#FFF7F2] px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF5200] text-white">
            <Bot size={16} />
          </span>
          <div>
            <p className="text-[12.5px] font-bold text-[#0F172A]">Assistant PAYZIK</p>
            <p className="text-[10px] text-[#64748B]">Prépare tes produits jusqu’à ton arrivée.</p>
          </div>
          <Sparkles size={14} className="ml-auto text-[#FF7A1A]" />
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin p-3">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
                  m.role === "user"
                    ? "rounded-br-md bg-[#FF5200] text-white"
                    : m.kind === "error"
                      ? "rounded-bl-md bg-rose-50 text-rose-700"
                      : m.kind === "success"
                        ? "rounded-bl-md bg-emerald-50 text-emerald-800"
                        : "rounded-bl-md bg-[#F1F5F9] text-[#0F172A]"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <p className="text-[10.5px] font-semibold text-[#FF5200]">L’assistant prépare ta commande…</p>
          )}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-[#E2E8F0] p-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            placeholder="Ex : 2 lait et 1 pain, j’arrive…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5200] text-white disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <h2 className="text-[13px] font-bold text-[#0F172A]">Suivi de mes commandes</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Aucune commande. Demande une préparation à l’assistant ci-dessus.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {orders.map((o) => {
              const s = STATUS[o.status];
              const Icon = s.icon;
              return (
                <div key={o.id} className="rounded-xl border border-[#E2E8F0] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] font-bold text-[#0F172A]">
                      {shopName(o.shop_id)}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${s.cls}`}>
                      <Icon size={11} /> {s.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    {o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                  </p>
                  <p className="mt-1 text-[9.5px] text-[#94A3B8]">
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

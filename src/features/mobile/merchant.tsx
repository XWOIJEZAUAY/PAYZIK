/** Espace COMMERÇANT — caisse vocale, kridi, stock et bilan. */
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Home,
  ImagePlus,
  Images,
  Loader2,
  MessageCircle,
  Mic,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ScanBarcode,
  ScanLine,
  SendHorizontal,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { daysSince, fmtDh } from "../../lib/format";
import { aiLangLabel, getAiLang, setAiLang, type AiLang } from "../../lib/aiLang";
import { PIN_THRESHOLD } from "../../lib/wallet";
import { resizeImageFile, searchProductImage } from "../../services/imageSearch";
import { listMyShops } from "../../services/backend/payzikCards";
import { listShopOrders, type PrepOrder } from "../../services/backend/payzikOrders";
import type { Profile } from "../../services/auth";
import {
  aiAvailable,
  matchProducts,
  parseVoiceText,
} from "../../services/ai";
import {
  LiveSession,
  liveAvailable,
  type LiveSessionCallbacks,
} from "../../services/ai/live";
import { createLiveToolHandlers } from "../../services/ai/liveTools";
import { runAgentText } from "../../services/ai/agent";
import { shortReply } from "../../services/ai/shortReply";
import { parseUtterance } from "../voice/VoiceInput";
import type { Store as StoreType } from "../../state/store";
import type { CardTx, Category, Client, Product, WalletCard } from "../../types";
import { CardScanSheet } from "./CardScanSheet";
import { ProductScanSheet } from "./ProductScanSheet";
import { MerchantRecharges } from "./MerchantRecharges";
import {
  Avatar,
  Btn,
  cx,
  Empty,
  Kpi,
  Pane,
  Sheet,
  StockPill,
  TabBar,
} from "./ui";
import { MerchantOffers } from "./MerchantOffers";
import { MerchantOrders } from "./MerchantOrders";

export type MerchantTab =
  | "home"
  | "caisse"
  | "stock"
  | "clients"
  | "profil"
  | "kridi"
  | "cartes"
  | "recharges"
  | "promos"
  | "orders"
  | "bilan";

/* Une seule tentative d'image par référence et par session : évite de
 * relancer l'API Open Food Facts à chaque changement d'onglet. */
const imageTriedOnce = new Set<string>();

/** Navigation inférieure : 5 onglets, conformément au cahier des charges.
 *  Les autres sections restent accessibles par navigation interne. */
const MERCHANT_TABS: { id: MerchantTab; label: string; icon: typeof Wallet }[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "caisse", label: "Caisse", icon: ScanLine },
  { id: "stock", label: "Stock", icon: Package },
  { id: "clients", label: "Clients", icon: Users },
  { id: "profil", label: "Profil", icon: UserRound },
];

/** Met en évidence l'onglet parent quand une section interne est ouverte. */
const PARENT_TAB: Partial<Record<MerchantTab, MerchantTab>> = {
  cartes: "home",
  recharges: "home",
  promos: "home",
  orders: "home",
  bilan: "home",
  kridi: "clients",
};

/** Illustration locale quand Open Food Facts n'a pas de photo (cas fréquent au Maroc). */
function productArt(p: Product): string {
  if (p.image) return p.image;
  const bg = "#FDF9FE";
  const em = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="${bg}"/>${body}</svg>`;
  const shapes: Record<string, string> = {
    "p-lait": `<path d="M34 24h32l8 12v48H26V36z" fill="#FFFFFF" stroke="#A08BAE" stroke-width="2"/><path d="M34 24l10-8h22l-6 8z" fill="#FFFFFF" stroke="#A08BAE" stroke-width="2"/><rect x="30" y="52" width="40" height="18" rx="3" fill="#0EA5E9"/>`,
    "p-sidiali": `<rect x="43" y="10" width="14" height="8" rx="2" fill="#0284C7"/><path d="M41 18h18v10l7 14v42a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V42l7-14z" fill="#7DD3FC" stroke="#0284C7" stroke-width="2"/><rect x="35" y="54" width="30" height="18" rx="2" fill="#FFFFFF"/>`,
    "p-pain": `<ellipse cx="50" cy="55" rx="32" ry="22" fill="#B45309"/><path d="M24 50q12-14 28-14t24 14" fill="#D97706"/><path d="M34 46l4-8M50 42l4-8M66 46l4-8" stroke="#FCD34D" stroke-width="3" stroke-linecap="round"/>`,
    "p-sukkar": `<path d="M30 22h40l4 62H26z" fill="#FFFFFF" stroke="#A08BAE" stroke-width="2"/><rect x="29" y="44" width="42" height="18" fill="#DC2626"/><path d="M38 34h24" stroke="#D8C9E4" stroke-width="4" stroke-linecap="round"/>`,
    "p-coca": `<rect x="34" y="16" width="32" height="70" rx="8" fill="#DC2626" stroke="#991B1B" stroke-width="2"/><rect x="34" y="44" width="32" height="12" fill="#FFFFFF"/><ellipse cx="50" cy="16" rx="16" ry="5" fill="#B91C1C"/>`,
    "p-the": `<rect x="30" y="22" width="40" height="60" rx="3" fill="#15803D" stroke="#166534" stroke-width="2"/><rect x="36" y="38" width="28" height="26" rx="2" fill="#FEF3C7"/><path d="M44 51q6-10 12 0-6 8-12 0z" fill="#16A34A"/>`,
  };
  const body = shapes[p.id] ??
    `<text x="50" y="72" text-anchor="middle" font-size="58">${p.emoji}</text>`;
  return `data:image/svg+xml,${encodeURIComponent(em(body))}`;
}

type VoiceChip = {
  name: string;
  emoji: string;
  image?: string;
  qty: number;
  priceDh: number;
};
type VoiceMsg = {
  id: string;
  role: "user" | "ai" | "tool";
  text: string;
  kind?: "info" | "success" | "error";
  products?: VoiceChip[];
};

/** Détecte une demande de total, en darija comme en français. */
const asksTotal = (text: string) =>
  /majmou3|majmo3|lkhlas|khelles|total|ch7al\s+l/i.test(text);

/** Garde une seule phrase courte, sans jamais couper un montant utile. */
const brief = (s: string) => {
  const first = s.split(/(?<=[.!?])\s/)[0]?.trim() ?? s;
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
};

export function MerchantSpace({
  store,
  tab,
  setTab,
  onProfile,
  notify,
  user,
}: {
  store: StoreType;
  tab: MerchantTab;
  setTab: (t: MerchantTab) => void;
  onProfile: () => void;
  notify: (m: string) => void;
  user?: Profile;
}) {
  const [shopName, setShopName] = useState("Ma boutique");
  const [shopCity, setShopCity] = useState("");
  const [shopImage, setShopImage] = useState<string | null>(null);
  const [shopIds, setShopIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await listMyShops();
      if (alive && res.ok && res.data.length) {
        const shop = res.data[0];
        setShopName(shop.shop_name);
        setShopCity(shop.city ?? "");
        setShopImage(shop.image ?? null);
        setShopIds(res.data.map((s) => s.id));
      }
    })();
    return () => { alive = false; };
  }, []);

  const storeName = shopName;

  return (
    <>
      <MerchantHeader
        name={storeName}
        city={shopCity}
        onProfile={onProfile}
        image={shopImage ?? user?.image ?? null}
      />
      <main
        className={cx(
          "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-2",
          tab === "caisse" ? "flex overflow-hidden pb-0" : "pb-24",
        )}
      >
        {tab === "home" && (
          <MerchantHome
            store={store}
            shopName={storeName}
            shopCity={shopCity}
            shopIds={shopIds}
            setTab={setTab}
          />
        )}
        {tab === "caisse" && (
          <Caisse
            store={store}
            notify={notify}
            merchantName={storeName}
            shopName={shopName}
            shopBadge={
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[#8136A8] to-[#E91E83] text-white font-bold text-[10px]">
                {shopName.split(" ")[0]?.[0] ?? "M"}
              </div>
            }
          />
        )}
        {tab === "clients" && <MerchantClients store={store} notify={notify} setTab={setTab} />}
        {tab === "kridi" && <MerchantKridi store={store} notify={notify} />}
        {tab === "stock" && <MerchantStock store={store} notify={notify} />}
        {tab === "cartes" && <MerchantCards store={store} notify={notify} />}
        {tab === "recharges" && <MerchantRecharges notify={notify} />}
        {tab === "promos" && <MerchantOffers notify={notify} />}
        {tab === "orders" && <MerchantOrders notify={notify} />}
        {tab === "bilan" && <Bilan store={store} />}
        {tab === "profil" && (
          <MerchantProfile
            name={storeName}
            city={shopCity}
            image={shopImage ?? user?.image ?? null}
            user={user}
            onProfile={onProfile}
            setTab={setTab}
          />
        )}
      </main>
      <TabBar
        value={PARENT_TAB[tab] ?? tab}
        onChange={setTab}
        items={MERCHANT_TABS}
        columns={5}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Accueil business — KPI et navigation interne (données réelles)       */
/* ------------------------------------------------------------------ */

function MerchantHome({
  store,
  shopName,
  shopCity,
  shopIds,
  setTab,
}: {
  store: StoreType;
  shopName: string;
  shopCity: string;
  shopIds: string[];
  setTab: (t: MerchantTab) => void;
}) {
  const [orders, setOrders] = useState<PrepOrder[]>([]);

  useEffect(() => {
    if (!shopIds.length) return;
    let alive = true;
    listShopOrders(shopIds).then((r) => {
      if (alive && r.ok) setOrders(r.data);
    });
    return () => { alive = false; };
  }, [shopIds]);

  const dayKey = (d: Date) => d.toDateString();
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const todaySales = store.sales.filter((s) => dayKey(new Date(s.date)) === dayKey(today));
  const yesterdaySales = store.sales.filter((s) => dayKey(new Date(s.date)) === dayKey(yesterday));
  const ca = todaySales.reduce((sum, s) => sum + s.totalDh, 0);
  const caYesterday = yesterdaySales.reduce((sum, s) => sum + s.totalDh, 0);
  const variation = caYesterday > 0 ? Math.round(((ca - caYesterday) / caYesterday) * 100) : null;

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const value = store.sales
      .filter((s) => dayKey(new Date(s.date)) === dayKey(d))
      .reduce((sum, s) => sum + s.totalDh, 0);
    return { label: d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2), value };
  });
  const maxWeek = Math.max(...week.map((w) => w.value), 1);

  const events = [
    ...orders.slice(0, 3).map((o) => ({
      id: `order-${o.id}`,
      label: "Nouvelle commande",
      sub: `${o.items.length} article(s) · ${o.status}`,
      amount: 0,
      date: o.created_at,
      icon: ShoppingCart,
    })),
    ...todaySales.slice(0, 3).map((s) => ({
      id: `sale-${s.id}`,
      label: s.method === "kridi" ? "Nouveau crédit" : "Nouveau paiement",
      sub: `#${s.ticketNo} · ${s.clientName ?? s.method}`,
      amount: s.totalDh,
      date: s.date,
      icon: s.method === "kridi" ? BookOpen : BadgeCheck,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  const sections: { id: MerchantTab; label: string; sub: string; icon: typeof Wallet; tone: string }[] = [
    { id: "cartes", label: "Cartes", sub: "Cartes PAYZIK", icon: CreditCard, tone: "bg-[#FCEAF4] text-[#E91E83]" },
    { id: "recharges", label: "Demandes", sub: "Recharges", icon: Wallet, tone: "bg-[#F1E5FA] text-[#8136A8]" },
    { id: "promos", label: "Promos", sub: "Offres actives", icon: Zap, tone: "bg-[#FCEAF4] text-[#F43F9E]" },
    { id: "orders", label: "Commandes", sub: "À préparer", icon: ClipboardList, tone: "bg-[#F1E5FA] text-[#51206F]" },
    { id: "bilan", label: "Bilan", sub: "Statistiques", icon: TrendingUp, tone: "bg-[#FCEAF4] text-[#E91E83]" },
  ];

  return (
    <div className="animate-fade-up space-y-3.5 pb-2">
      <section className="animate-fade-up rounded-[24px] bg-gradient-to-br from-[#FCEAF4] to-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#81748A]">
              Chiffre d'affaires aujourd'hui
            </p>
            <p className="mt-1 font-mono text-[29px] font-extrabold leading-none text-[#21152C]">
              {fmtDh(ca)}
            </p>
            {variation !== null && (
              <p className={`mt-1 text-[10.5px] font-bold ${variation >= 0 ? "text-[#059669]" : "text-[#DC2626]"}`}>
                {variation >= 0 ? "+" : ""}{variation}% vs hier
              </p>
            )}
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E91E83] to-[#F43F9E] text-white shadow-sm">
            <TrendingUp size={19} />
          </span>
        </div>
        {week.some((w) => w.value > 0) ? (
          <div className="mt-4 flex h-14 items-end gap-1.5">
            {week.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="animate-fade-up w-full rounded-t-md bg-gradient-to-t from-[#8136A8] to-[#E91E83]"
                  style={{
                    height: `${Math.max(6, (w.value / maxWeek) * 44)}px`,
                    animationDelay: `${i * 45}ms`,
                    animationFillMode: "both",
                  }}
                  title={fmtDh(w.value)}
                />
                <span className="text-[8px] font-semibold text-[#81748A]">{w.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-[10.5px] text-[#81748A]">
            Le graphique apparaîtra après vos premières ventes réelles.
          </p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2">
        {[
          { label: "Ventes", value: String(todaySales.length), icon: Receipt, tone: "text-[#E91E83]" },
          { label: "Clients", value: String(store.clients.length), icon: Users, tone: "text-[#8136A8]" },
          { label: "Commandes", value: String(orders.length), icon: ShoppingCart, tone: "text-[#F43F9E]" },
        ].map((k, i) => (
          <div
            key={k.label}
            className="animate-fade-up rounded-2xl bg-white p-3 text-center shadow-sm"
            style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
          >
            <k.icon size={16} className={`mx-auto ${k.tone}`} />
            <p className="mt-1 font-mono text-[17px] font-extrabold text-[#21152C]">{k.value}</p>
            <p className="text-[9.5px] font-semibold text-[#81748A]">{k.label}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        {sections.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 text-left shadow-sm active:scale-[.98]"
            style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.tone}`}>
              <s.icon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-bold text-[#21152C]">{s.label}</span>
              <span className="block truncate text-[9.5px] text-[#81748A]">{s.sub}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-[#A08BAE]" />
          </button>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#21152C]">Notifications</h2>
          <button onClick={() => setTab("orders")} className="text-[10.5px] font-bold text-[#E91E83]">
            Voir tout
          </button>
        </div>
        {events.length ? (
          <div className="space-y-1.5">
            {events.map((e, i) => (
              <div
                key={e.id}
                className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm"
                style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1E5FA] text-[#8136A8]">
                  <e.icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-bold text-[#21152C]">{e.label}</p>
                  <p className="truncate text-[9.5px] text-[#81748A]">
                    {e.sub} · {new Date(e.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {e.amount > 0 && (
                  <span className="shrink-0 font-mono text-[11px] font-bold text-[#059669]">
                    +{fmtDh(e.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 text-[11px] text-[#81748A] shadow-sm">
            <Bell size={16} className="text-[#E91E83]" />
            Aucune notification pour le moment.
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-bold text-[#21152C]">Dernières ventes</h2>
        {store.sales.length ? (
          <div className="space-y-1.5">
            {[...store.sales].reverse().slice(0, 3).map((s, i) => (
              <div
                key={s.id}
                className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm"
                style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCEAF4] text-[#E91E83]">
                  <Receipt size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-bold text-[#21152C]">
                    Ticket #{s.ticketNo} · {s.clientName ?? s.method}
                  </p>
                  <p className="text-[9.5px] text-[#81748A]">
                    {new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-bold text-[#21152C]">{fmtDh(s.totalDh)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 text-[11px] text-[#81748A] shadow-sm">
            <Receipt size={16} className="text-[#8136A8]" />
            Les ventes réelles apparaîtront ici.
          </div>
        )}
      </section>

      <button
        onClick={() => setTab("caisse")}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#E91E83] to-[#F43F9E] text-[12px] font-bold text-white shadow-sm active:scale-[.99]"
      >
        <ScanLine size={17} /> Ouvrir la caisse
      </button>
      <p className="text-center text-[9.5px] text-[#81748A]">
        {shopName}{shopCity ? ` · ${shopCity}` : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clients + carnet Kridi                                               */
/* ------------------------------------------------------------------ */

function MerchantClients({
  store,
  notify,
  setTab,
}: {
  store: StoreType;
  notify: (m: string) => void;
  setTab: (t: MerchantTab) => void;
}) {
  const [view, setView] = useState<"clients" | "kridi">("clients");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  const debtors = store.clients.filter((c) => c.debtDh > 0);
  const totalDebt = debtors.reduce((s, c) => s + c.debtDh, 0);
  const repaid = store.clients.reduce(
    (s, c) => s + c.history.filter((h) => h.amountDh < 0).reduce((a, h) => a + Math.abs(h.amountDh), 0),
    0,
  );
  const clients = store.clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="animate-fade-up space-y-3 pb-2">
      <div className="flex items-center justify-between">
        <h1 className="text-[19px] font-extrabold text-[#21152C]">Mes Clients</h1>
        <button
          onClick={() => setAddOpen(true)}
          className="flex h-9 items-center gap-1 rounded-xl bg-gradient-to-r from-[#E91E83] to-[#F43F9E] px-3 text-[10.5px] font-bold text-white shadow-sm active:scale-95"
        >
          <Plus size={15} /> Nouveau client
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total des créances", value: fmtDh(totalDebt), tone: "bg-[#FCEAF4] text-[#E91E83]" },
          { label: "Total remboursé", value: fmtDh(repaid), tone: "bg-[#EAF9F1] text-[#059669]" },
          { label: "Clients débiteurs", value: String(debtors.length), tone: "bg-[#F1E5FA] text-[#8136A8]" },
          { label: "Montant restant", value: fmtDh(totalDebt), tone: "bg-white text-[#51206F]" },
        ].map((k, i) => (
          <div
            key={k.label}
            className={`animate-fade-up rounded-2xl p-3 shadow-sm ${k.tone}`}
            style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
          >
            <p className="text-[9.5px] font-bold uppercase tracking-wide opacity-70">{k.label}</p>
            <p className="mt-1 font-mono text-[16px] font-extrabold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 rounded-xl bg-[#F1E5FA] p-1">
        {(["clients", "kridi"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition ${
              view === id ? "bg-white text-[#E91E83] shadow-sm" : "text-[#81748A]"
            }`}
          >
            {id === "clients" ? "Clients" : "Carnet Kridi"}
          </button>
        ))}
      </div>

      {view === "kridi" ? (
        <MerchantKridi store={store} notify={notify} />
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A08BAE]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un client..."
              className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#E91E83]"
            />
          </div>

          {clients.length ? (
            <div className="space-y-2">
              {clients.map((c, i) => (
                <div
                  key={c.id}
                  className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm"
                  style={{ animationDelay: `${Math.min(i, 12) * 45}ms`, animationFillMode: "both" }}
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-[#21152C]">{c.name}</p>
                    <p className="truncate text-[9.5px] text-[#81748A]">
                      {c.phone ?? (c.debtDh > 0 ? "Client débiteur" : "Client régulier")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 font-mono text-[9.5px] font-bold ${
                      c.debtDh > 0 ? "bg-[#FCEAF4] text-[#E91E83]" : "bg-[#EAF9F1] text-[#059669]"
                    }`}
                  >
                    {c.debtDh > 0 ? `Dette ${fmtDh(c.debtDh)}` : "Solde 0 DH"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Users size={22} />}
              title="Aucun client"
              hint="Ajoutez un client pour suivre ses achats et son carnet Kridi."
            />
          )}
        </>
      )}

      <button
        onClick={() => setTab("home")}
        className="w-full rounded-xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#8136A8]"
      >
        Retour à l'accueil
      </button>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Nouveau client">
        <label className="block">
          <span className="text-[10.5px] font-semibold text-[#81748A]">Nom du client</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom et prénom"
            className="mt-1 h-11 w-full rounded-xl border border-[#E9DDF2] bg-white px-3 text-[12px] outline-none focus:border-[#E91E83]"
          />
        </label>
        <Btn
          className="mt-3 w-full"
          disabled={!name.trim()}
          onClick={() => {
            store.addClient(name.trim());
            setName("");
            setAddOpen(false);
            notify("Client ajouté");
          }}
        >
          <Plus size={15} /> Ajouter le client
        </Btn>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profil marchand                                                      */
/* ------------------------------------------------------------------ */

function MerchantProfile({
  name,
  city,
  image,
  user,
  onProfile,
  setTab,
}: {
  name: string;
  city: string;
  image?: string | null;
  user?: Profile;
  onProfile: () => void;
  setTab: (t: MerchantTab) => void;
}) {
  const menu: { label: string; sub: string; icon: typeof Wallet; internal?: MerchantTab }[] = [
    { label: "Informations boutique", sub: "Nom, photo, ville", icon: Store },
    { label: "Horaires d'ouverture", sub: "Voir les paramètres", icon: Clock3 },
    { label: "Promotions", sub: "Offres de la boutique", icon: Zap, internal: "promos" },
    { label: "Paramètres", sub: "Compte et sécurité", icon: BadgeCheck },
    { label: "Aide et support", sub: "Contacter PAYZIK", icon: MessageCircle },
  ];
  return (
    <div className="animate-fade-up space-y-3 pb-2">
      <h1 className="text-[19px] font-extrabold text-[#21152C]">Mon Profil</h1>
      <section className="rounded-[24px] bg-white p-4 text-center shadow-sm">
        <div className="mx-auto w-fit rounded-full ring-4 ring-[#F1E5FA]">
          <Avatar name={name} image={image} />
        </div>
        <p className="mt-2 text-[15px] font-extrabold text-[#21152C]">{name}</p>
        <p className="text-[10.5px] text-[#81748A]">{city || "Ville non renseignée"}</p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#EAF9F1] px-2.5 py-1 text-[9.5px] font-bold text-[#059669]">
          <BadgeCheck size={12} /> Boutique active
        </span>
        {user?.email && <p className="mt-2 truncate text-[10px] text-[#81748A]">{user.email}</p>}
      </section>

      <section className="overflow-hidden rounded-[20px] bg-white shadow-sm">
        {menu.map((m) => (
          <button
            key={m.label}
            onClick={() => (m.internal ? setTab(m.internal) : onProfile())}
            className="flex w-full items-center gap-3 border-b border-[#F7F1FB] px-4 py-3 text-left last:border-0 active:bg-[#FDF9FE]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCEAF4] text-[#E91E83]">
              <m.icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] font-bold text-[#21152C]">{m.label}</span>
              <span className="block truncate text-[9.5px] text-[#81748A]">{m.sub}</span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-[#A08BAE]" />
          </button>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setTab("bilan")}
          className="rounded-xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#8136A8]"
        >
          Voir le bilan
        </button>
        <button
          onClick={() => setTab("orders")}
          className="rounded-xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#8136A8]"
        >
          Commandes
        </button>
      </section>

      <button
        onClick={onProfile}
        className="w-full rounded-2xl border border-[#E91E83] bg-white py-3 text-[12px] font-bold text-[#E91E83] active:bg-[#FCEAF4]"
      >
        Se déconnecter
      </button>
    </div>
  );
}

function MerchantHeader({
  name,
  city,
  onProfile,
  image,
}: {
  name: string;
  city: string;
  onProfile: () => void;
  image?: string | null;
}) {
  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#E91E83] via-[#D41874] to-[#51206F] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+14px)] text-white">
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-2.5">
        <button onClick={onProfile} aria-label="Ma boutique" className="shrink-0 rounded-2xl ring-2 ring-white/60 active:scale-95">
          <Avatar name={name} image={image} square />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/75">PAYZIK Business</p>
          <p className="truncate text-[15px] font-bold leading-tight">{name}</p>
          {city && <p className="truncate text-[10px] text-white/70">{city}</p>}
        </div>
        <button
          onClick={onProfile}
          aria-label="Notifications et profil"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur active:scale-95"
        >
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Caisse vocale                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Caisse — style AgentChat : fil de discussion, IA par texte et boutons */
/* ------------------------------------------------------------------ */

function Caisse({
  store,
  notify,
  merchantName,
  shopBadge,
  shopName,
}: {
  store: StoreType;
  notify: (m: string) => void;
  merchantName?: string;
  shopBadge?: React.ReactNode;
  shopName?: string;
}) {
  const [msgs, setMsgs] = useState<VoiceMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking">("idle");
  const [lang, setLang] = useState<AiLang>(() => getAiLang());
  const [live, setLive] = useState<"idle" | "connecting" | "listening" | "speaking" | "error">("idle");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptItems, setReceiptItems] = useState<{ productId: string; qty: number }[]>([]);
  const [kridiOpen, setKridiOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPay, setPendingPay] = useState<{
    method: "cash" | "card" | "kridi" | "wallet";
    clientId?: string;
    cardId?: string;
  } | null>(null);
  const [cardScanOpen, setCardScanOpen] = useState(false);
  const [productScanOpen, setProductScanOpen] = useState(false);
  const [lastSale, setLastSale] = useState<{ id: string; label: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const seqRef = useRef(0);

  const say = (m: Omit<VoiceMsg, "id">) =>
    setMsgs((prev) => [
      ...prev,
      { ...m, id: `m-${++seqRef.current}-${Date.now()}` },
    ]);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, phase]);

  useEffect(
    () => () => {
      liveRef.current?.stop();
      liveRef.current = null;
    },
    [],
  );

  // Les photos des produits fréquents sont chargées dès l'ouverture de la caisse.
  useEffect(() => {
    const freq = ["p-lait", "p-sidiali", "p-pain", "p-sukkar", "p-coca", "p-the"];
    const missing = store.products
      .filter((p) => !p.image && !imageTriedOnce.has(p.id))
      .sort((a, b) => {
        const ai = freq.indexOf(a.id);
        const bi = freq.indexOf(b.id);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      })
      .slice(0, 8);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const p of missing) {
        if (cancelled) return;
        imageTriedOnce.add(p.id);
        try {
          const res = await searchProductImage(p.name);
          if (!cancelled && res?.url) store.updateProduct(p.id, { image: res.url });
        } catch {
          /* emoji de repli dans la discussion */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store.products, store.updateProduct]);

  /** Appel Gemini Live : le symbole change, la fonctionnalité reste. */
  const toggleLive = () => {
    if (liveRef.current) {
      liveRef.current.stop();
      liveRef.current = null;
      setLive("idle");
      say({ role: "ai", text: "Appel terminé." });
      return;
    }
    if (!liveAvailable()) {
      say({
        role: "ai",
        kind: "error",
        text: "Indisponible. Écris ta commande.",
      });
      return;
    }
    setLive("connecting");
    const handlers = createLiveToolHandlers(() => storeRef.current);
    const callbacks: LiveSessionCallbacks = {
      onReady: () => setLive("listening"),
      onActivity: (s) => setLive(s),
      onUserTranscript: (text, done) => {
        if (done && text)
          setMsgs((prev) => [
            ...prev,
            { id: `lu-${Date.now()}`, role: "user", text },
          ]);
      },
      onToolCall: async (call) => {
        const handler = handlers[call.name];
        if (!handler) return { ok: false, error: "outil inconnu" };
        const outcome = handler(call.args);
        const chips: VoiceChip[] = (outcome.products ?? [])
          .map((ref) => {
            const p = storeRef.current.productById(ref.productId);
            return p
              ? {
                  name: p.name,
                  emoji: p.emoji,
                  image: p.image,
                  qty: ref.qty,
                  priceDh: p.priceDh,
                }
              : null;
          })
          .filter(Boolean) as VoiceChip[];
        if (chips.length || outcome.message)
          say({ role: "ai", text: brief(outcome.message ?? ""), products: chips.length ? chips : undefined });
        if (call.name === "getCart" && outcome.products?.length) {
          setReceiptItems(outcome.products.map((p) => ({ productId: p.productId, qty: p.qty })));
          setReceiptOpen(true);
        }
        return outcome.data;
      },
      onError: () => {
        setLive("error");
        say({
          role: "ai",
          kind: "error",
          text: "Appel coupé. Réessaie.",
        });
      },
      onClose: () => setLive((s) => (s === "error" ? s : "idle")),
    };
    const session = new LiveSession(storeRef.current.products, callbacks, merchantName);
    liveRef.current = session;
    void session.start();
  };

  /** Encaissement confirmé : on garde la vente pour pouvoir l'annuler après coup.
   *  Une carte PAYZIK est toujours vérifiée en base et débitée avant la vente. */
  const finalize = (
    method: "cash" | "card" | "kridi" | "wallet",
    clientId?: string,
    cardId?: string,
  ) => {
    const sale = cardId ? store.checkoutWithCard(cardId) : store.checkout(method, clientId);
    setConfirmOpen(false);
    if (!sale) {
      say({
        role: "ai",
        kind: "error",
        text: cardId ? "Carte invalide." : "Panier vide.",
      });
      notify(cardId ? "Carte non valide ou solde insuffisant" : "Panier vide");
      return;
    }
    setLastSale({ id: sale.id, label: `${fmtDh(sale.totalDh)} · ticket #${sale.ticketNo}` });
    setCelebrate(true);
    window.setTimeout(() => setCelebrate(false), 1500);
    setTicketOpen(false);
    say({
      role: "ai",
      kind: "success",
      text: `Encaissé · ${fmtDh(sale.totalDh)} · ticket #${sale.ticketNo}.`,
    });
    notify(`Ticket #${sale.ticketNo} · ${fmtDh(sale.totalDh)} encaissé`);
  };

  const undoLast = () => {
    if (!lastSale) return;
    if (store.voidSale(lastSale.id)) {
      say({ role: "ai", text: "Vente annulée." });
      notify("Vente annulée.");
    }
    setLastSale(null);
  };

  /** Envoi d'une commande écrite. L'IA répond en texte (jamais à voix haute). */
  const send = async (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!text || phase === "thinking") return;
    setAiLang(lang);
    setDraft("");
    setMsgs((prev) => [
      ...prev,
      { id: `u-${++seqRef.current}-${Date.now()}`, role: "user", text },
    ]);
    const wantsTotal = asksTotal(text);
    setPhase("thinking");

    try {
      // L'agent texte accède aux mêmes données/outils que Gemini Live :
      // stock, cartes, kridi, ventes, et modifications du catalogue.
      if (!wantsTotal) {
        const outcome = runAgentText(text, () => storeRef.current);
        if (outcome) {
          const needsInput = Object.keys(outcome.data).some((k) => k.startsWith("need"));
          const reply = await shortReply(brief(outcome.message ?? "C'est noté."), `Caisse : ${text}`);
          say({
            role: "ai",
            kind: outcome.data.ok === false && !needsInput ? "error" : "info",
            text: reply,
          });
          return;
        }
      }
      const result = aiAvailable()
        ? await parseVoiceText(text, storeRef.current.products)
        : null;
      // Sans IA disponible, on reconnaît quand même les noms du catalogue.
      const items = result
        ? matchProducts(result.items, storeRef.current.products)
        : parseUtterance(text, storeRef.current.products);
      for (const it of items) storeRef.current.addToCart(it.product.id, it.qty);
      const chips = items.map((i) => ({
        name: i.product.name,
        emoji: i.product.emoji,
        image: i.product.image,
        qty: i.qty,
        priceDh: i.product.priceDh,
      }));

      if (wantsTotal) {
        // Le ticket papier animé s'ouvre sur demande de total, avec le bon montant.
        setReceiptItems(
          storeRef.current.cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        );
        setReceiptOpen(true);
        const count = storeRef.current.cart.length;
        const total = storeRef.current.cartTotal;
        const local = count ? `Total : ${fmtDh(total)}.` : "Ticket vide.";
        const reply = await shortReply(local, `Panier : ${count} article(s), ${total} DH`);
        say({
          role: "ai",
          kind: "info",
          text: reply,
          products: chips.length ? chips : undefined,
        });
      } else {
        const local = items.length
          ? `Ajouté : ${items.map((i) => `${i.qty} × ${i.product.name}`).join(", ")}.`
          : "Produit introuvé.";
        const reply = await shortReply(local, `Commande : ${text}`);
        say({
          role: "ai",
          kind: items.length ? "info" : "error",
          text: reply,
          products: chips.length ? chips : undefined,
        });
      }
    } catch {
      say({
        role: "ai",
        kind: "error",
        text: "Réessaie.",
      });
    } finally {
      setPhase("idle");
    }
  };

  const clearAll = () => {
    store.clearCart();
    say({ role: "ai", text: "Panier vidé." });
    setCancelOpen(false);
  };

  // (Produits fréquents supprimés de l'affichage pour alléger la caisse.)

  const immersive =
    live === "connecting" || live === "listening" || live === "speaking";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#FDF9FE]">
      {immersive && (
        <div className="animate-fade-up absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-[#51206F] via-[#3A1152] to-[#160C1D] px-5 text-white">
          <div className="relative flex h-48 w-48 items-center justify-center">
            <span className="absolute h-44 w-44 animate-ping rounded-full border border-[#F43F9E]/30" />
            <span className="absolute h-36 w-36 animate-ping rounded-full border border-[#E91E83]/40" style={{ animationDelay: "0.35s" }} />
            <span className="absolute h-28 w-28 animate-ping rounded-full border border-white/25" style={{ animationDelay: "0.7s" }} />
            <span className="animate-wave flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#E91E83] to-[#F43F9E] shadow-[0_0_50px_rgba(233,30,131,0.45)]">
              <Mic size={42} />
            </span>
          </div>
          <div className="mt-6 flex h-8 items-end gap-1">
            {[12, 22, 16, 30, 20, 26, 14, 24, 18, 28, 15, 21].map((h, i) => (
              <span
                key={i}
                className="animate-wave w-1 rounded-full bg-[#F43F9E]/80"
                style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <p className="mt-5 text-[16px] font-bold">
            {live === "connecting" ? "Connexion à l'assistant…" : "Écoute en cours..."}
          </p>
          <p className="mt-1 text-[11.5px] text-white/70">Vous pouvez parler maintenant</p>
          <button
            onClick={toggleLive}
            className="mt-7 rounded-2xl border border-white/30 bg-white/10 px-6 py-2.5 text-[12px] font-bold active:scale-95"
          >
            Annuler
          </button>
        </div>
      )}
      {/* ---------------- en-tête boutique ---------------- */}
      {shopBadge && (
        <div className="p-3 border-b border-[#E9DDF2] bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#21152C]">{shopName ?? "Ma boutique"}</span>
            {shopBadge}
          </div>
        </div>
      )}
      {/* ---------------- fil de discussion (style AgentChat) ---------------- */}
      <div ref={threadRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">

        {msgs.length === 0 && phase === "idle" && (
          <div className="animate-fade-up flex min-h-full flex-col items-center justify-center py-4 text-center">
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#FCEAF4] to-[#F1E5FA]">
              <span className="absolute inset-2 animate-ping rounded-full border border-[#E91E83]/25" />
              <span className="absolute inset-5 animate-ping rounded-full border border-[#8136A8]/20" style={{ animationDelay: "0.5s" }} />
              <span className="animate-wave flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E91E83] to-[#8136A8] text-white shadow-lg">
                <Zap size={32} fill="currentColor" />
              </span>
            </div>
            <p className="mt-5 max-w-[270px] text-[14px] font-bold leading-snug text-[#21152C]">
              Bonjour ! Dites-moi ce que vous souhaitez ajouter au panier.
            </p>
            <p className="mt-1 text-[10.5px] text-[#81748A]">
              Par voix, par texte ou en scannant vos produits.
            </p>
            <div className="mt-5 grid w-full max-w-[300px] grid-cols-2 gap-2">
              <button
                onClick={toggleLive}
                className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#E91E83] to-[#F43F9E] text-[11.5px] font-bold text-white shadow-sm active:scale-95"
              >
                <Mic size={16} /> Parler
              </button>
              <button
                onClick={() => setProductScanOpen(true)}
                className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-[#E9DDF2] bg-white text-[11.5px] font-bold text-[#8136A8] shadow-sm active:scale-95"
              >
                <ScanBarcode size={16} /> Scanner les produits
              </button>
            </div>
            <p className="mt-4 text-[9.5px] text-[#81748A]">
              Langue : {aiLangLabel(lang)}
            </p>
          </div>
        )}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="animate-fade-up flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-br-md bg-[#E91E83] px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-white shadow-sm">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#F1E5FA] text-[#E91E83]">
                <Zap size={13} fill="currentColor" />
              </span>
              <div className="min-w-0 max-w-[86%] flex-1 space-y-2">
                {m.text && (
                  <div
                    className={cx(
                      "animate-fade-up rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[12px] font-medium leading-snug shadow-sm",
                      m.kind === "error"
                        ? "border-[#FECACA] bg-[#FCEAF4] text-[#DC2626]"
                        : m.kind === "success"
                          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]"
                          : "border-[#E9DDF2] bg-white text-[#21152C]",
                    )}
                  >
                    {m.text}
                  </div>
                )}
                {m.products && m.products.length > 0 && (
                  <p className="px-1 text-[10.5px] text-[#81748A]">
                    {m.products.map((c) => `${c.qty}× ${c.name}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ),
        )}

        {phase === "thinking" && (
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-[#81748A]">
            <Loader2 size={16} className="animate-spin text-[#E91E83]" />
            …
          </div>
        )}
      </div>

      {/* ---------------- panier ---------------- */}
      {store.cart.length > 0 && (
        <div className="border-t border-[#E9DDF2] bg-white px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#81748A]">Votre panier</p>
            <button
              onClick={() => inputRef.current?.focus()}
              className="text-[10px] font-bold text-[#E91E83]"
            >
              Continuer à ajouter
            </button>
          </div>
          <div className="scrollbar-thin mt-1.5 max-h-32 space-y-1 overflow-y-auto">
            {store.cart.map((line) => {
              const p = store.productById(line.productId);
              return (
                <div key={line.productId} className="flex items-center gap-2 rounded-xl bg-[#FDF9FE] p-1.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F1E5FA] text-[14px]">
                    {p?.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" /> : p?.emoji ?? "🧺"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#21152C]">
                    {p?.name ?? line.productId}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => store.setQty(line.productId, line.qty - 1)}
                      aria-label="Retirer une unité"
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[#8136A8] shadow-sm"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-4 text-center font-mono text-[11px] font-bold text-[#21152C]">{line.qty}</span>
                    <button
                      onClick={() => store.setQty(line.productId, line.qty + 1)}
                      aria-label="Ajouter une unité"
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-[#E91E83] shadow-sm"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => store.setQty(line.productId, 0)}
                    aria-label="Supprimer la ligne"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#DC2626]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- barre ticket (haute, comme AgentChat) ---------------- */}
      <div className="relative border-t border-[#E9DDF2] bg-white px-4 py-3">
        {celebrate && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="animate-popIn absolute h-1.5 w-1.5 rounded-full bg-[#E91E83]"
                style={{
                  left: `${8 + ((i * 37) % 84)}%`,
                  top: `${10 + ((i * 23) % 70)}%`,
                  animationDelay: `${i * 45}ms`,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#81748A]">
              Ticket #{store.ticketNo} · {store.cart.length} article
              {store.cart.length > 1 ? "s" : ""}
            </p>
            <p key={store.cartTotal} className="animate-popIn font-mono text-[25px] font-bold leading-tight text-[#21152C]">
              {fmtDh(store.cartTotal)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setCancelOpen(true)}
              disabled={store.cart.length === 0}
              className="rounded-lg border border-[#E9DDF2] px-2.5 py-2 text-[10.5px] font-semibold text-[#DC2626] disabled:opacity-30"
            >
              Vider
            </button>
            <button
              onClick={() => setTicketOpen(true)}
              disabled={store.cart.length === 0}
              className="flex items-center gap-1 rounded-lg border border-[#E9DDF2] px-2.5 py-2 text-[10.5px] font-semibold text-[#21152C] disabled:opacity-30"
            >
              <Receipt size={13} /> Ticket · Payer
            </button>
          </div>
        </div>
        {lastSale && (
          <div className="animate-fade-up mt-2 flex items-center justify-between rounded-lg bg-[#FDF9FE] px-2.5 py-1.5">
            <span className="truncate text-[10.5px] text-[#81748A]">
              Dernière : {lastSale.label}
            </span>
            <button
              onClick={undoLast}
              className="flex shrink-0 items-center gap-1 text-[10.5px] font-bold text-[#DC2626]"
            >
              <RotateCcw size={11} /> Annuler
            </button>
          </div>
        )}
      </div>

      {/* ---------------- composeur : gros bouton IA + texte + envoi ---------------- */}
      <div className="border-t border-[#E9DDF2] bg-white px-3 pb-[calc(58px+env(safe-area-inset-bottom))] pt-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            {(live === "listening" || live === "speaking" || live === "connecting") && (
              <>
                <span className="absolute h-11 w-11 animate-ping rounded-full border border-[#E91E83]/40" />
                <span
                  className="absolute h-11 w-11 animate-ping rounded-full border border-[#E91E83]/20"
                  style={{ animationDelay: "0.45s" }}
                />
              </>
            )}
            <button
              onClick={toggleLive}
              className={cx(
                "relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm transition active:scale-90",
                live === "error" ? "bg-[#DC2626]" : "bg-[#E91E83]",
              )}
              aria-label={live === "idle" ? "Appeler l'IA Gemini" : "Raccrocher l'appel IA"}
              title={live === "idle" ? "Appeler l'IA Gemini" : "Raccrocher l'appel IA"}
            >
              {live === "connecting" ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Mic size={22} />
              )}
            </button>
          </div>
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="2 lait, 1 pain…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || phase === "thinking"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E91E83] text-white shadow-sm disabled:opacity-40"
              aria-label="Envoyer la commande"
              title="Envoyer"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
          <select
            value={lang}
            onChange={(e) => {
              const next = e.target.value as AiLang;
              setLang(next);
              setAiLang(next);
            }}
            aria-label="Langue de l'assistant"
            title="Langue de l'assistant"
            className="h-11 max-w-[92px] shrink-0 rounded-xl border border-[#E9DDF2] bg-white px-1.5 text-[9.5px] font-bold text-[#8136A8] outline-none focus:border-[#E91E83]"
          >
            <option value="fr">Français</option>
            <option value="darija">Darija</option>
            <option value="tachelhit">Tamazight (Souss)</option>
          </select>
        </div>
        <button
          onClick={() => setProductScanOpen(true)}
          className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] text-[11px] font-bold text-[#8136A8] active:scale-[.99]"
        >
          <ScanBarcode size={15} /> Scanner les produits
        </button>
      </div>

      <KridiPickModal
        open={kridiOpen}
        clients={store.clients}
        onClose={() => setKridiOpen(false)}
        onPick={(c) => {
          finalize("kridi", c.id);
          setKridiOpen(false);
        }}
      />

      <TicketSheet
        open={ticketOpen}
        store={store}
        merchantName={merchantName ?? shopName ?? "Ma boutique"}
        ticketNo={store.ticketNo}
        onPay={(method, clientId) => {
          setPendingPay({ method, clientId });
          setConfirmOpen(true);
        }}
        onCardScan={() => setCardScanOpen(true)}
        onClose={() => setTicketOpen(false)}
      />

      <ProductScanSheet
        open={productScanOpen}
        store={store}
        onClose={() => setProductScanOpen(false)}
        onAdded={(name) => {
          setProductScanOpen(false);
          say({ role: "ai", kind: "success", text: `Produit ajouté ! ${name}` });
          notify(`${name} ajouté au panier`);
        }}
      />

      <CardScanSheet
        open={cardScanOpen}
        cards={store.cards}
        totalDh={store.cartTotal}
        onClose={() => setCardScanOpen(false)}
        onValid={(card) => {
          setPendingPay({ method: "wallet", cardId: card.id });
          setCardScanOpen(false);
          setConfirmOpen(true);
        }}
      />

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Annuler la commande ?">
        <p className="text-[12px] text-[#81748A]">Vider le panier ?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn variant="soft" onClick={() => setCancelOpen(false)}>
            Garder le ticket
          </Btn>
          <Btn variant="danger" onClick={clearAll}>
            <Trash2 size={14} /> Annuler
          </Btn>
        </div>
      </Sheet>

      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmer l'encaissement">
        <div className="space-y-1.5 rounded-xl bg-[#FDF9FE] p-3">
          {store.cart.map((l) => {
            const p = store.productById(l.productId);
            return (
              <div key={l.productId} className="flex justify-between text-[11.5px]">
                <span className="text-[#81748A]">
                  {l.qty} × {p?.name ?? l.productId}
                </span>
                <span className="font-mono font-semibold text-[#21152C]">
                  {fmtDh((p?.priceDh ?? 0) * l.qty)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-[#E9DDF2] pt-2 text-[14px] font-bold text-[#21152C]">
            <span>Total</span>
            <span className="font-mono">{fmtDh(store.cartTotal)}</span>
          </div>
        </div>
        {pendingPay?.cardId && (
          <p className="mt-2 text-[11px] font-semibold text-[#21152C]">
            Carte {store.cards.find((c) => c.id === pendingPay.cardId)?.name ?? ""} · solde après
            paiement{" "}
            {fmtDh(
              Math.max(
                0,
                (store.cards.find((c) => c.id === pendingPay.cardId)?.balanceDh ?? 0) -
                  store.cartTotal,
              ),
            )}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn variant="soft" onClick={() => setConfirmOpen(false)}>
            <Pencil size={14} /> Modifier
          </Btn>
          <Btn
            variant="green"
            onClick={() => {
              if (!pendingPay) return;
              finalize(pendingPay.method, pendingPay.clientId, pendingPay.cardId);
              setPendingPay(null);
            }}
          >
            <Check size={14} /> Confirmer
          </Btn>
        </div>
      </Sheet>

      {/* ---------------- feuille papier animée sur demande de total ---------------- */}
      {receiptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#21152C]/50"
            onClick={() => setReceiptOpen(false)}
          />
          <div className="animate-paperUnfold relative w-full max-w-[360px] rounded-sm bg-white p-5 shadow-sm">
            <button
              onClick={() => setReceiptOpen(false)}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#21152C] text-white shadow-sm"
              aria-label="Fermer le ticket"
            >
              <X size={14} />
            </button>
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#81748A]">
                PAYZIK · Ticket
              </p>
              <p className="mt-1 text-[16px] font-bold text-[#21152C]">
                Ticket #{store.ticketNo}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              {receiptItems.map((l, i) => {
                const p = store.productById(l.productId);
                if (!p) return null;
                return (
                  <div
                    key={`${l.productId}-${i}`}
                    className="animate-slide-in-right flex items-center gap-2"
                    style={{ animationDelay: `${i * 85}ms`, animationFillMode: "both" }}
                  >
                    <img src={productArt(p)} alt={p.name} className="h-9 w-9 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#21152C]">
                      {p.name}
                    </span>
                    <span className="font-mono text-[11px] text-[#81748A]">×{l.qty}</span>
                    <span className="font-mono text-[12px] font-bold text-[#21152C]">
                      {fmtDh(p.priceDh * l.qty)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              className="animate-fade-up mt-3 flex items-end justify-between border-t-2 border-dashed border-[#E9DDF2] pt-2"
              style={{ animationDelay: `${receiptItems.length * 85 + 80}ms`, animationFillMode: "both" }}
            >
              <span className="text-[13px] font-bold text-[#21152C]">Total</span>
              <span className="animate-popIn font-mono text-[20px] font-bold text-[#21152C]">
                {fmtDh(
                  receiptItems.reduce((s, l) => {
                    const p = store.productById(l.productId);
                    return s + (p ? p.priceDh * l.qty : 0);
                  }, 0),
                )}
              </span>
            </div>
            <p className="mt-2 text-center text-[9px] text-[#81748A]">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─</p>
          </div>
        </div>
      )}

    </div>
  );
}

/** Ticket « papier » animé, déplié quand le commerçant demande le total. */
function TicketSheet({
  open,
  store,
  merchantName,
  ticketNo,
  onPay,
  onCardScan,
  onClose,
}: {
  open: boolean;
  store: StoreType;
  merchantName: string;
  ticketNo: number;
  onPay: (
    method: "cash" | "card" | "kridi" | "wallet",
    clientId?: string,
    cardId?: string,
  ) => void;
  onCardScan: () => void;
  onClose: () => void;
}) {
  const [creditOpen, setCreditOpen] = useState(false);
  const [newClient, setNewClient] = useState("");

  useEffect(() => {
    if (!open) {
      setCreditOpen(false);
      setNewClient("");
    }
  }, [open]);

  if (!open) return null;

  const pay = (method: "cash" | "card" | "kridi", clientId?: string) => {
    onPay(method, clientId);
    onClose();
  };

  const lines = store.cart.map((l) => {
    const p = store.productById(l.productId);
    return {
      id: l.productId,
      name: p?.name ?? l.productId,
      qty: l.qty,
      priceDh: p?.priceDh ?? 0,
      image: p?.image,
      emoji: p?.emoji ?? "🧺",
    };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="animate-paperUnfold max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#81748A]">
              Ticket de caisse
            </p>
            <p className="text-[15px] font-bold text-[#21152C]">{merchantName}</p>
            <p className="text-[10.5px] text-[#81748A]">
              Ticket #{ticketNo} ·{" "}
              {new Date().toLocaleString("fr-FR", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le ticket"
            className="rounded-lg p-1.5 text-[#81748A] transition hover:bg-[#F7F1FB]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-2 border-b border-dashed border-[#E9DDF2] pb-3">
          {lines.length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#81748A]">Panier vide</p>
          )}
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="animate-slide-in-right flex items-center gap-2"
              style={{ animationDelay: `${i * 85}ms`, animationFillMode: "both" }}
            >
              <span className="animate-scale-in flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F7F1FB] text-sm">
                {l.image ? (
                  <img src={l.image} alt={l.name} className="h-full w-full object-cover" />
                ) : (
                  l.emoji
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#21152C]">
                {l.qty} × {l.name}
              </span>
              <span className="font-mono text-[12px] font-bold text-[#21152C]">
                {fmtDh(l.priceDh * l.qty)}
              </span>
            </div>
          ))}
        </div>

        <div className="animate-fade-up relative mt-3 flex items-end justify-between overflow-hidden rounded-xl bg-[#F1E5FA] px-3 py-2.5"
          style={{ animationDelay: `${lines.length * 85 + 80}ms`, animationFillMode: "both" }}
        >
          <span className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer bg-[#E91E83]/10" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#81748A]">
            Total
          </span>
          <span className="animate-popIn font-mono text-[26px] font-bold leading-none text-[#21152C]">
            {fmtDh(store.cartTotal)}
          </span>
        </div>

        {creditOpen ? (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold text-[#81748A]">
              Sur quel carnet Kridi ?
            </p>
            <div className="scrollbar-thin flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {store.clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pay("kridi", c.id)}
                  className="rounded-full border border-[#E9DDF2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#21152C] active:bg-[#F7F1FB]"
                >
                  {c.name}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newClient.trim();
                if (!name) return;
                pay("kridi", store.addClient(name).id);
              }}
            >
              <input
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                placeholder="Nouveau client…"
                className="h-9 min-w-0 flex-1 rounded-lg border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[11px] outline-none focus:border-[#E91E83]"
              />
              <Btn type="submit" variant="dark" disabled={!newClient.trim()}>
                Créer
              </Btn>
            </form>
            <button
              onClick={() => setCreditOpen(false)}
              className="text-[11px] font-semibold text-[#81748A]"
            >
              Annuler
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const text = `${merchantName} — Ticket #${ticketNo}\n${lines.map((l) => `${l.qty}× ${l.name}`).join("\n")}\nTotal ${fmtDh(store.cartTotal)}`;
                  if (navigator.share) void navigator.share({ title: "Ticket PAYZIK", text }).catch(() => {});
                }}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E9DDF2] bg-white text-[11px] font-bold text-[#8136A8] active:bg-[#F7F1FB]"
              >
                <Receipt size={15} /> Partager
              </button>
              <button
                onClick={() => window.print()}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#E9DDF2] bg-white text-[11px] font-bold text-[#8136A8] active:bg-[#F7F1FB]"
              >
                <Printer size={15} /> Imprimer
              </button>
            </div>

            <p className="mt-4 text-[11px] font-bold text-[#21152C]">
              Choisissez une modalité de paiement
            </p>
            <div className="mt-2 space-y-2">
              <button
                disabled={lines.length === 0}
                onClick={onCardScan}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#F1E5FA] bg-gradient-to-r from-[#FCEAF4] to-white p-3 text-left active:scale-[.99] disabled:opacity-40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E91E83] text-white shadow-sm">
                  <CreditCard size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-[#21152C]">Carte PAYZIK</span>
                  <span className="block text-[10px] text-[#81748A]">Scanner QR</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[#E91E83]" />
              </button>
              <button
                disabled={lines.length === 0}
                onClick={() => pay("cash")}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#E9DDF2] bg-white p-3 text-left active:scale-[.99] disabled:opacity-40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF9F1] text-[#059669]">
                  <Banknote size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-[#21152C]">Espèces</span>
                  <span className="block text-[10px] text-[#81748A]">Cash</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[#059669]" />
              </button>
              <button
                disabled={lines.length === 0}
                onClick={() => setCreditOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#F1E5FA] bg-gradient-to-r from-[#F1E5FA] to-white p-3 text-left active:scale-[.99] disabled:opacity-40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#8136A8] text-white">
                  <Wallet size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-[#21152C]">Crédit</span>
                  <span className="block text-[10px] text-[#81748A]">Kridi</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[#8136A8]" />
              </button>
              <button
                type="button"
                disabled
                aria-disabled
                className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-dashed border-[#E9DDF2] bg-white/60 p-3 text-left opacity-70"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF1E6] text-[#FF7A1A]">
                  <CreditCard size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-[#21152C]">Carte bancaire</span>
                  <span className="block text-[10px] text-[#81748A]">Bientôt disponible</span>
                </span>
              </button>
            </div>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#81748A]"
            >
              Retour
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carnet Kridi commerçant                                              */
/* ------------------------------------------------------------------ */

function MerchantKridi({
  store,
  notify,
}: {
  store: StoreType;
  notify: (m: string) => void;
}) {
  const [target, setTarget] = useState<Client | null>(null);
  const debtors = [...store.clients]
    .filter((c) => c.debtDh > 0)
    .sort((a, b) => b.debtDh - a.debtDh);
  const total = debtors.reduce((s, c) => s + c.debtDh, 0);

  const wa = (c: Client) => {
    const msg = `Salam ${c.name}, 3andek ${fmtDh(c.debtDh)} f kridi. Chokran 🙏`;
    if (c.phone) {
      window.open(
        `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`,
        "_blank",
      );
    } else {
      notify(`Pas de numéro pour ${c.name}`);
    }
  };

  return (
    <div className="animate-fade-up space-y-3">
      <Pane className="p-4">
        <p className="text-[11px] text-[#81748A]">Créances Kridi en cours</p>
        <p className="mt-1 font-mono text-[26px] font-bold text-[#DC2626]">{fmtDh(total)}</p>
        <p className="text-[11px] text-[#81748A]">
          {debtors.length} client(s) à relancer
        </p>
      </Pane>

      {debtors.map((c) => (
        <Pane key={c.id} className="p-3">
          <div className="flex items-center gap-3">
            <Avatar name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-[#21152C]">{c.name}</p>
              <p className="truncate text-[10.5px] text-[#81748A]">
                {c.history[0]
                  ? `Dernier achat il y a ${daysSince(c.history[0].date)}j`
                  : "Aucun achat"}
                {c.note ? ` · ${c.note}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[14px] font-bold text-[#DC2626]">
                {fmtDh(c.debtDh)}
              </p>
              <p className="text-[9.5px] text-[#81748A]">{c.phone ?? "—"}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => wa(c)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#059669] py-2 text-[11px] font-bold text-white active:scale-95"
            >
              <MessageCircle size={13} /> Relance WhatsApp
            </button>
            <button
              onClick={() => setTarget(c)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E9DDF2] bg-white py-2 text-[11px] font-bold text-[#21152C] active:scale-95"
            >
              <Banknote size={13} /> Encaisser acompte
            </button>
          </div>
        </Pane>
      ))}

      {debtors.length === 0 && (
        <Empty
          icon={<BookOpen size={22} />}
          title="Aucune créance"
          hint="Les achats à crédit apparaîtront ici."
        />
      )}

      <AcompteModal
        client={target}
        onClose={() => setTarget(null)}
        onConfirm={(c, amount) => {
          store.payDebt(c.id, amount);
          notify(`Acompte de ${fmtDh(amount)} reçu de ${c.name}`);
          setTarget(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stock & inventaire                                                   */
/* ------------------------------------------------------------------ */

const CATS: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "Boissons", label: "Boissons" },
  { id: "Épicerie", label: "Épicerie" },
  { id: "Frais", label: "Frais" },
  { id: "Hygiène", label: "Hygiène" },
];

function MerchantStock({
  store,
  notify,
}: {
  store: StoreType;
  notify: (m: string) => void;
}) {
  const [cat, setCat] = useState<"all" | Category>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // Comme avant : on complète automatiquement les photos des références
  // les plus utilisées (Open Food Facts), une seule fois par session.
  useEffect(() => {
    const missing = store.products
      .filter((p) => !p.image && !imageTriedOnce.has(p.id))
      .slice(0, 12);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const p of missing) {
        if (cancelled) return;
        imageTriedOnce.add(p.id);
        try {
          const res = await searchProductImage(p.name);
          if (!cancelled && res?.url) store.updateProduct(p.id, { image: res.url });
        } catch {
          /* photo manuelle toujours possible depuis la fiche produit */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store.products, store.updateProduct]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.products.filter(
      (p) =>
        (cat === "all" || p.category === cat) &&
        (!q || p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.includes(q))),
    );
  }, [store.products, cat, query]);

  const alerts = store.products.filter((p) => p.stock <= 5).length;

  const importPhoto = async (product: Product, file: File) => {
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file, 300);
      store.updateProduct(product.id, { image: dataUrl });
      setActive({ ...product, image: dataUrl });
      notify("Photo du produit enregistrée");
    } catch {
      notify("Impossible de lire la photo");
    } finally {
      setBusy(false);
    }
  };

  const findImage = async (product: Product) => {
    setBusy(true);
    try {
      const res = await searchProductImage(product.name);
      if (res?.url) {
        store.updateProduct(product.id, { image: res.url });
        setActive({ ...product, image: res.url });
        notify("Image trouvée");
      } else {
        notify("Aucune image trouvée pour ce produit");
      }
    } catch {
      notify("Recherche d'image indisponible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-[#21152C]">Catalogue de référence</h2>
          <p className="text-[10.5px] text-[#81748A]">
            {store.products.length} produits · utilisé par la caisse vocale
          </p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#DC2626]">
          <AlertTriangle size={13} /> {alerts} alertes
        </span>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A08BAE]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit…"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#E91E83]"
        />
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition",
              cat === c.id
                ? "border-transparent bg-[#21152C] text-white"
                : "border-[#E9DDF2] bg-white text-[#81748A]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {list.map((p, i) => (
          <div
            key={p.id}
            className="animate-fade-up overflow-hidden rounded-xl border border-[#E9DDF2] bg-white shadow-sm"
            style={{ animationDelay: `${Math.min(i, 14) * 40}ms`, animationFillMode: "both" }}
          >
            <button
              onClick={() => setActive(p)}
              className="relative block aspect-[4/3] w-full overflow-hidden bg-[#F7F1FB]"
              aria-label={`Voir ${p.name}`}
            >
              {p.image ? (
                <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-4xl">
                  {p.emoji}
                </span>
              )}
              <span className="absolute right-1.5 top-1.5">
                <StockPill stock={p.stock} />
              </span>
            </button>
            <div className="p-2">
              <p className="truncate text-[11.5px] font-semibold text-[#21152C]">{p.name}</p>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="font-mono text-[11px] font-bold text-[#E91E83]">
                  {fmtDh(p.priceDh)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => store.adjustStock(p.id, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E9DDF2] active:scale-90"
                    aria-label="Retirer un"
                  >
                    <Minus size={11} />
                  </button>
                  <button
                    onClick={() => store.adjustStock(p.id, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E9DDF2] active:scale-90"
                    aria-label="Ajouter un"
                  >
                    <Plus size={11} />
                  </button>
                  <button
                    onClick={() => store.adjustStock(p.id, 12)}
                    className="rounded-md border border-[#E9DDF2] px-1.5 py-0.5 text-[9.5px] font-bold text-[#21152C] active:scale-90"
                  >
                    +12
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {list.length === 0 && (
        <Empty icon={<Package size={22} />} title="Aucun produit" hint="Change de catégorie." />
      )}

      <button
        onClick={() => setAdding(true)}
        className="fixed bottom-[88px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#E91E83] px-4 py-3 text-[12px] font-bold text-white shadow-lg active:scale-95"
      >
        <Plus size={16} /> Nouveau produit
      </button>

      <ProductEditorSheet
        product={active}
        store={store}
        notify={notify}
        busy={busy}
        onClose={() => setActive(null)}
        onImport={importPhoto}
        onFind={findImage}
      />
      <AddProductModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(p) => {
          store.addProduct(p);
          notify(`Produit ajouté : ${p.name}`);
          setAdding(false);
        }}
      />
    </div>
  );
}

/** Fiche produit : photo (import / recherche), prix, stock, alias de dictée vocale. */
function ProductEditorSheet({
  product,
  store,
  notify,
  busy,
  onClose,
  onImport,
  onFind,
}: {
  product: Product | null;
  store: StoreType;
  notify: (m: string) => void;
  busy: boolean;
  onClose: () => void;
  onImport: (p: Product, file: File) => void;
  onFind: (p: Product) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState<Category>("Épicerie");
  const [emoji, setEmoji] = useState("📦");
  const [aliases, setAliases] = useState("");

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setPrice(String(product.priceDh));
    setStock(String(product.stock));
    setCategory(product.category);
    setEmoji(product.emoji);
    setAliases(product.aliases.join(", "));
  }, [product]);

  if (!product) return null;

  const save = () => {
    if (!name.trim() || !price) return;
    store.updateProduct(product.id, {
      name: name.trim(),
      priceDh: Number(price) || 0,
      stock: Math.max(0, Number(stock) || 0),
      category,
      emoji: emoji.trim() || "📦",
      aliases: aliases
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    });
    notify("Produit mis à jour");
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Fiche produit">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#F7F1FB]">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-7xl">
            {product.emoji}
          </span>
        )}
        <span className="absolute bottom-2 right-2">
          <StockPill stock={product.stock} />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#E9DDF2] py-2 text-[11px] font-semibold text-[#21152C] active:bg-[#F7F1FB]">
          <Camera size={14} /> Importer une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(product, file);
              e.target.value = "";
            }}
          />
        </label>
        <Btn variant="soft" disabled={busy} onClick={() => onFind(product)}>
          <ImagePlus size={14} /> Chercher une image
        </Btn>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du produit"
        className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Prix (DH)"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[12px] outline-none focus:border-[#E91E83]"
        />
        <input
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[12px] outline-none focus:border-[#E91E83]"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-2 text-[11px] outline-none focus:border-[#E91E83]"
        >
          {CATS.filter((c) => c.id !== "all").map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-center text-[14px] outline-none focus:border-[#E91E83]"
        />
      </div>
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="Alias darija (séparés par des virgules)"
        className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[11px] outline-none focus:border-[#E91E83]"
      />

      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={() => store.adjustStock(product.id, -1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9DDF2] active:scale-90"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => store.adjustStock(product.id, 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9DDF2] active:scale-90"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={() => store.adjustStock(product.id, 12)}
          className="rounded-lg border border-[#E9DDF2] px-2 py-1 text-[10px] font-bold active:scale-90"
        >
          +12
        </button>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[#059669]">
          <Images size={13} /> Référence catalogue
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn variant="primary" onClick={save} disabled={!name.trim() || !price}>
          <Save size={14} /> Enregistrer
        </Btn>
        <Btn
          variant="dark"
          onClick={() => {
            store.addToCart(product.id);
            notify(`${product.name} ajouté au ticket`);
            onClose();
          }}
        >
          <Plus size={14} /> Ajouter au ticket
        </Btn>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Cartes PAYZIK (espace commerçant)                                    */
/* ------------------------------------------------------------------ */

function MerchantCards({
  store,
  notify,
}: {
  store: StoreType;
  notify: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanCode, setScanCode] = useState("");

  const cards = useMemo(() => {
    const t = q.trim().toLowerCase();
    return store.cards.filter(
      (c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t),
    );
  }, [store.cards, q]);

  const detail = store.cards.find((c) => c.id === detailId) ?? null;
  const totalFloat = store.cards.reduce((s, c) => s + c.balanceDh, 0);

  const openByCode = () => {
    const code = scanCode.trim().toUpperCase();
    if (!code) return;
    const card = store.findCardByCode(code);
    if (card) {
      setDetailId(card.id);
      setScanOpen(false);
      setScanCode("");
    } else {
      notify("Aucune carte ne correspond à ce code");
    }
  };

  return (
    <div className="animate-fade-up space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-[#21152C]">Cartes PAYZIK</h2>
          <p className="text-[10.5px] text-[#81748A]">
            Rechargeables · QR unique · solde en direct
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-[#F7F1FB] px-2 py-1 text-[10px] font-semibold text-[#81748A]">
          <Wallet size={12} /> {store.cards.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Cartes", value: String(store.cards.length) },
          { label: "Encours", value: fmtDh(totalFloat) },
          { label: "PIN dès", value: `${PIN_THRESHOLD} DH` },
        ].map((k) => (
          <Pane key={k.label} className="p-2.5">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#81748A]">
              {k.label}
            </p>
            <p className="mt-1 font-mono text-[15px] font-bold text-[#21152C]">{k.value}</p>
          </Pane>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A08BAE]"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom ou code de carte…"
            className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#E91E83]"
          />
        </div>
        <Btn variant="soft" onClick={() => setScanOpen(true)} aria-label="Trouver une carte">
          <ScanLine size={15} />
        </Btn>
      </div>

      {cards.length === 0 ? (
        <Empty icon={<CreditCard size={22} />} title="Aucune carte" hint="Crée la première carte client." />
      ) : (
        <div className="space-y-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setDetailId(c.id)}
              className="animate-popIn block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#E91E83] to-[#C9A3E0] p-4 text-left text-white shadow-md active:scale-[.99]"
              style={{ animationDelay: `${Math.min(i, 12) * 45}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-start justify-between">
                <CreditCard size={20} className="text-white/90" />
                <span className="rounded-full border border-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80">
                  PAYZIK
                </span>
              </div>
              <p className="mt-3 truncate text-[14px] font-bold">{c.name}</p>
              <p className="font-mono text-[10.5px] text-white/50">{c.code}</p>
              <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-2">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-white/50">Solde</p>
                  <p className="font-mono text-[18px] font-bold">{fmtDh(c.balanceDh)}</p>
                </div>
                <p className="text-[10px] text-white/60">{c.phone ?? "—"}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-[88px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#E91E83] px-4 py-3 text-[12px] font-bold text-white shadow-lg active:scale-95"
      >
        <Plus size={16} /> Nouvelle carte
      </button>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Trouver une carte">
        <p className="text-[11.5px] text-[#81748A]">
          Saisis le code affiché sur la carte (ex. PZK-8F3K-92).
        </p>
        <input
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value.toUpperCase())}
          placeholder="PZK-XXXX-XXXX"
          className="mt-2 h-11 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[13px] uppercase outline-none focus:border-[#E91E83]"
        />
        <Btn className="mt-2 w-full" onClick={openByCode} disabled={!scanCode.trim()}>
          <Check size={15} /> Ouvrir la carte
        </Btn>
      </Sheet>

      <NewCardSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(card) => {
          setCreating(false);
          setDetailId(card.id);
          notify(`Carte ${card.code} créée`);
        }}
        store={store}
      />
      <CardDetailSheet
        card={detail}
        store={store}
        notify={notify}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function NewCardSheet({
  open,
  onClose,
  onCreate,
  store,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (card: WalletCard) => void;
  store: StoreType;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [initial, setInitial] = useState("");
  const valid = name.trim().length > 0 && (pin === "" || /^\d{4}$/.test(pin));

  return (
    <Sheet open={open} onClose={onClose} title="Nouvelle carte PAYZIK">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du client (ex. Khadija)"
        className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (optionnel)"
        className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN ••••"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[12px] tracking-widest outline-none focus:border-[#E91E83]"
        />
        <input
          inputMode="numeric"
          value={initial}
          onChange={(e) => setInitial(e.target.value.replace(/\D/g, ""))}
          placeholder="Recharge (DH)"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[12px] outline-none focus:border-[#E91E83]"
        />
      </div>
      <p className="mt-2 text-[10.5px] text-[#81748A]">
        Le PIN est demandé pour les paiements ≥ {PIN_THRESHOLD} DH.
      </p>
      <Btn
        className="mt-3 w-full"
        disabled={!valid}
        onClick={() => {
          const card = store.addCard({
            name: name.trim(),
            phone: phone.trim() || undefined,
            pin: pin || undefined,
            initialDh: initial ? Number(initial) : 0,
          });
          setName("");
          setPhone("");
          setPin("");
          setInitial("");
          onCreate(card);
        }}
      >
        <Plus size={15} /> Créer la carte et le QR
      </Btn>
    </Sheet>
  );
}

function CardDetailSheet({
  card,
  store,
  notify,
  onClose,
}: {
  card: WalletCard | null;
  store: StoreType;
  notify: (m: string) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [qr, setQr] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const txs: CardTx[] = card ? store.cardTxFor(card.id) : [];

  useEffect(() => {
    if (!card) return;
    setName(card.name);
    setPhone(card.phone ?? "");
    setPin(card.pin ?? "");
    setAmount("");
    setEditing(false);
    let alive = true;
    QRCode.toDataURL(card.code, {
      margin: 1,
      width: 220,
      color: { dark: "#21152C", light: "#FFFFFF" },
    })
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => setQr(""));
    return () => {
      alive = false;
    };
  }, [card]);

  if (!card) return null;

  const recharge = () => {
    if (typeof amount !== "number" || amount <= 0) return;
    store.topUpCard(card.id, amount);
    notify(`+${fmtDh(amount)} — solde ${fmtDh(card.balanceDh + amount)}`);
    setAmount("");
  };

  const print = () => {
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Carte ${card.code}</title>
       <style>body{font-family:Arial;text-align:center;padding:24px;color:#21152C}
       .code{font-size:22px;font-weight:800;letter-spacing:2px;margin:8px 0}
       .name{font-size:20px;font-weight:800}.sub{color:#81748A;font-size:12px}
       img{width:240px;height:240px}@media print{.noprint{display:none}}</style></head>
       <body><div class="name">${card.name}</div><div class="sub">Carte PAYZIK</div>
       <img src="${qr}"/><div class="code">${card.code}</div>
       <div class="sub">Présente ce QR en caisse à chaque achat</div>
       <button class="noprint" onclick="window.print()">Imprimer</button></body></html>`,
    );
    w.document.close();
  };

  return (
    <Sheet open onClose={onClose} title={`Carte — ${card.name}`}>
      <div className="flex items-center gap-3 rounded-xl bg-[#FDF9FE] p-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E9DDF2] bg-white">
          {qr ? <img src={qr} alt={`QR ${card.code}`} className="h-full w-full object-contain" /> : <QrPlaceholder />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#81748A]">
            Solde disponible
          </p>
          <p className="font-mono text-[22px] font-bold text-[#21152C]">{fmtDh(card.balanceDh)}</p>
          <p className="truncate font-mono text-[10.5px] text-[#81748A]">{card.code}</p>
          <p className="truncate text-[10.5px] text-[#81748A]">{card.phone ?? "—"}</p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom"
            className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white px-3 text-[12px] outline-none focus:border-[#E91E83]"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone"
              className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white px-3 text-[12px] outline-none focus:border-[#E91E83]"
            />
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN"
              className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#E91E83]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn
              variant="soft"
              onClick={() => {
                setEditing(false);
                setName(card.name);
                setPhone(card.phone ?? "");
                setPin(card.pin ?? "");
              }}
            >
              Annuler
            </Btn>
            <Btn
              onClick={() => {
                if (!name.trim() || (pin && !/^\d{4}$/.test(pin))) return;
                store.updateCard(card.id, {
                  name: name.trim(),
                  phone: phone.trim() || undefined,
                  pin: pin || undefined,
                });
                setEditing(false);
                notify("Carte mise à jour");
              }}
            >
              <Save size={14} /> Enregistrer
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] font-semibold text-[#81748A]">Recharger la carte</p>
            <div className="flex flex-wrap gap-1.5">
              {[20, 50, 100, 200].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={cx(
                    "rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold transition",
                    amount === v
                      ? "border-[#E91E83] bg-[#F1E5FA] text-[#E91E83]"
                      : "border-[#E9DDF2] bg-white text-[#21152C]",
                  )}
                >
                  {v} DH
                </button>
              ))}
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
                placeholder="Autre"
                className="h-8 w-20 rounded-lg border border-[#E9DDF2] bg-white px-2 font-mono text-[11px] outline-none focus:border-[#E91E83]"
              />
            </div>
            <Btn className="mt-2 w-full" onClick={recharge} disabled={typeof amount !== "number" || amount <= 0}>
              <Check size={15} /> Encaisser la recharge
            </Btn>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] font-semibold text-[#81748A]">Historique</p>
            <div className="scrollbar-thin max-h-32 space-y-1 overflow-y-auto">
              {txs.length === 0 && (
                <p className="py-2 text-center text-[11px] text-[#81748A]">Aucune opération.</p>
              )}
              {txs.map((t) => (
                <div
                  key={t.id}
                  className="animate-fade-up flex items-center justify-between rounded-lg border border-[#E9DDF2] bg-white px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#21152C]">{t.label}</p>
                    <p className="text-[9.5px] text-[#81748A]">
                      {new Date(t.at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "font-mono text-[12px] font-bold",
                      t.type === "topup" ? "text-[#059669]" : "text-[#DC2626]",
                    )}
                  >
                    {t.type === "topup" ? "+" : "−"}
                    {fmtDh(t.amountDh)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Btn variant="soft" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Modifier
            </Btn>
            <Btn variant="dark" onClick={print} disabled={!qr}>
              <Printer size={14} /> Imprimer
            </Btn>
            <Btn
              variant="green"
              onClick={() => {
                if (card.balanceDh <= 0) return notify("Solde insuffisant");
                notify(`Carte ${card.code} · ${fmtDh(card.balanceDh)} disponibles`);
              }}
            >
              <Wallet size={14} /> Payer
            </Btn>
          </div>
        </>
      )}
    </Sheet>
  );
}

function QrPlaceholder() {
  return (
    <div className="grid h-full w-full grid-cols-4 gap-0.5 p-2">
      {Array.from({ length: 16 }).map((_, i) => (
        <span key={i} className={cx("rounded-[1px]", i % 3 === 0 ? "bg-[#21152C]" : "bg-[#E9DDF2]")} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bilan                                                                */
/* ------------------------------------------------------------------ */

function Bilan({ store }: { store: StoreType }) {
  const todaySales = store.sales.filter(
    (s) => new Date(s.date).toDateString() === new Date().toDateString(),
  );
  const total = todaySales.reduce((s, x) => s + x.totalDh, 0);
  const cardTotal = todaySales
    .filter((s) => s.method === "card")
    .reduce((s, x) => s + x.totalDh, 0);
  const cashTotal = total - cardTotal;
  const kridi = store.clients.reduce((s, c) => s + c.debtDh, 0);

  const days = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const dayTotal = store.sales
        .filter((s) => new Date(s.date).toDateString() === key)
        .reduce((sum, s) => sum + s.totalDh, 0);
      out.push({
        label: d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3),
        total: dayTotal,
      });
    }
    return out;
  }, [store.sales]);

  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const top = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of store.sales) {
      for (const l of s.lines) map.set(l.name, (map.get(l.name) ?? 0) + l.qty);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [store.sales]);

  return (
    <div className="animate-fade-up space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          label="Encaissé aujourd'hui"
          value={fmtDh(total)}
          icon={<Banknote size={14} />}
          tone="green"
        />
        <Kpi
          label="Tickets"
          value={String(todaySales.length)}
          icon={<Receipt size={14} />}
        />
        <Kpi label="Cash" value={fmtDh(cashTotal)} icon={<Wallet size={14} />} />
        <Kpi
          label="Carte PAYZIK"
          value={fmtDh(cardTotal)}
          icon={<CreditCard size={14} />}
          tone="orange"
        />
      </div>

      <Pane className="flex items-center gap-3 p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCEAF4] text-[#DC2626]">
          <Users size={18} />
        </span>
        <div className="flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#81748A]">
            Créances Kridi en cours
          </p>
          <p className="font-mono text-[16px] font-bold text-[#DC2626]">{fmtDh(kridi)}</p>
        </div>
        <ChevronRight size={16} className="text-[#A08BAE]" />
      </Pane>

      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#21152C]">7 derniers jours</h3>
        <div className="mt-4 flex h-32 items-end gap-1.5">
          {days.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cx(
                    "w-full rounded-t-md",
                    d.total > 0 ? "bg-[#E91E83]" : "bg-[#F7F1FB]",
                  )}
                  style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%` }}
                  title={`${d.label} · ${fmtDh(d.total)}`}
                />
              </div>
              <span className="text-[9px] font-semibold text-[#81748A]">{d.label}</span>
            </div>
          ))}
        </div>
      </Pane>

      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#21152C]">Top produits</h3>
        {top.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-[#81748A]">
            Encaisse une vente pour voir tes meilleurs produits.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {top.map(([name, qty], i) => (
              <div key={name} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F7F1FB] text-[10px] font-bold text-[#81748A]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[#21152C]">
                  {name}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#21152C]">
                  ×{qty}
                </span>
              </div>
            ))}
          </div>
        )}
      </Pane>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modales commerçant                                                   */
/* ------------------------------------------------------------------ */

function KridiPickModal({
  open,
  clients,
  onClose,
  onPick,
}: {
  open: boolean;
  clients: Client[];
  onClose: () => void;
  onPick: (c: Client) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Inscrire au Kridi">
      <p className="text-[11.5px] text-[#81748A]">
        Choisis le client. Le montant sera ajouté à son carnet.
      </p>
      <div className="mt-3 space-y-1.5">
        {clients.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#E9DDF2] p-2.5 text-left active:bg-[#FDF9FE]"
          >
            <Avatar name={c.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#21152C]">
                {c.name}
              </p>
              <p className="text-[10.5px] text-[#81748A]">
                Dette actuelle : {fmtDh(c.debtDh)}
              </p>
            </div>
            <ChevronRight size={15} className="text-[#A08BAE]" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function AcompteModal({
  client,
  onClose,
  onConfirm,
}: {
  client: Client | null;
  onClose: () => void;
  onConfirm: (c: Client, amount: number) => void;
}) {
  const [amount, setAmount] = useState<number | "">("");

  useEffect(() => {
    setAmount("");
  }, [client]);

  if (!client) return null;

  const quick = [50, 100, 200].filter((v) => v <= client.debtDh);

  return (
    <Sheet open onClose={onClose} title="Encaisser un acompte">
      <div className="flex items-center gap-3 rounded-xl bg-[#FDF9FE] p-3">
        <Avatar name={client.name} size={38} />
        <div>
          <p className="text-[13px] font-bold text-[#21152C]">{client.name}</p>
          <p className="text-[11px] text-[#81748A]">
            Dette : <span className="font-mono font-bold text-[#DC2626]">{fmtDh(client.debtDh)}</span>
          </p>
        </div>
      </div>

      {quick.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {quick.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={cx(
                "rounded-lg border py-2 font-mono text-[12px] font-bold transition",
                amount === v
                  ? "border-[#059669] bg-[#ECFDF5] text-[#059669]"
                  : "border-[#E9DDF2] text-[#21152C]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <input
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
        placeholder="Montant de l'acompte"
        className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[13px] outline-none focus:border-[#059669]"
      />

      <Btn
        variant="green"
        className="mt-3 w-full"
        disabled={
          typeof amount !== "number" || amount <= 0 || amount > client.debtDh
        }
        onClick={() => onConfirm(client, amount as number)}
      >
        <Banknote size={15} /> Encaisser {typeof amount === "number" ? fmtDh(amount) : ""}
      </Btn>
    </Sheet>
  );
}

function AddProductModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Omit<Product, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState<Category>("Épicerie");
  const [emoji, setEmoji] = useState("📦");
  const [aliases, setAliases] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setPrice("");
    setStock("");
    setCategory("Épicerie");
    setEmoji("📦");
    setAliases("");
    setImage(undefined);
  };

  const pickImage = async (file: File) => {
    setBusy(true);
    try {
      setImage(await resizeImageFile(file, 300));
    } catch {
      setImage(undefined);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!name.trim() || !price) return;
    onAdd({
      name: name.trim(),
      priceDh: Number(price),
      stock: Number(stock) || 0,
      category,
      emoji: emoji.trim() || "📦",
      aliases: [
        name.trim().toLowerCase(),
        ...aliases
          .split(",")
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
      ],
      image,
    });
    reset();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nouveau produit">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F1FB] text-3xl">
          {image ? <img src={image} alt="Aperçu" className="h-full w-full object-cover" /> : emoji}
        </div>
        <label className="flex-1 cursor-pointer rounded-xl border border-[#E9DDF2] py-2.5 text-center text-[11px] font-semibold text-[#21152C] active:bg-[#F7F1FB]">
          <Camera size={14} className="mr-1 inline" />
          {image ? "Changer la photo" : "Ajouter une photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickImage(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du produit"
        className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[13px] outline-none focus:border-[#E91E83]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Prix (DH)"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[13px] outline-none focus:border-[#E91E83]"
        />
        <input
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 font-mono text-[13px] outline-none focus:border-[#E91E83]"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-center text-[14px] outline-none focus:border-[#E91E83]"
        />
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Alias darija"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[11px] outline-none focus:border-[#E91E83]"
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(["Boissons", "Épicerie", "Frais", "Hygiène"] as Category[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cx(
              "rounded-lg border py-2 text-[10px] font-semibold transition",
              category === c
                ? "border-[#21152C] bg-[#21152C] text-white"
                : "border-[#E9DDF2] text-[#81748A]",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <Btn className="mt-3 w-full" onClick={submit} disabled={!name.trim() || !price}>
        <Plus size={15} /> Ajouter au catalogue
      </Btn>
    </Sheet>
  );
}

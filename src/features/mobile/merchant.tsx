/** Espace COMMERÇANT — caisse vocale, kridi, stock et bilan. */
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ImagePlus,
  Images,
  Loader2,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ScanLine,
  SendHorizontal,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { daysSince, fmtDh } from "../../lib/format";
import { getAiLang, setAiLang } from "../../lib/aiLang";
import { PIN_THRESHOLD } from "../../lib/wallet";
import { resizeImageFile, searchProductImage } from "../../services/imageSearch";
import { listMyShops } from "../../services/backend/payzikCards";
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

export type MerchantTab = "caisse" | "kridi" | "stock" | "cartes" | "recharges" | "promos" | "orders" | "bilan";

/* Une seule tentative d'image par référence et par session : évite de
 * relancer l'API Open Food Facts à chaque changement d'onglet. */
const imageTriedOnce = new Set<string>();

const MERCHANT_TABS: { id: MerchantTab; label: string; icon: typeof Wallet }[] = [
  { id: "caisse", label: "Caisse", icon: ScanLine },
  { id: "kridi", label: "Carnet", icon: BookOpen },
  { id: "stock", label: "Stock", icon: Package },
  { id: "cartes", label: "Cartes", icon: CreditCard },
  { id: "recharges", label: "Demandes", icon: Wallet },
  { id: "promos", label: "Promos", icon: Zap },
  { id: "orders", label: "Commandes", icon: ClipboardList },
  { id: "bilan", label: "Bilan", icon: TrendingUp },
];

/** Illustration locale quand Open Food Facts n'a pas de photo (cas fréquent au Maroc). */
function productArt(p: Product): string {
  if (p.image) return p.image;
  const bg = "#F8FAFC";
  const em = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="${bg}"/>${body}</svg>`;
  const shapes: Record<string, string> = {
    "p-lait": `<path d="M34 24h32l8 12v48H26V36z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2"/><path d="M34 24l10-8h22l-6 8z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2"/><rect x="30" y="52" width="40" height="18" rx="3" fill="#0EA5E9"/>`,
    "p-sidiali": `<rect x="43" y="10" width="14" height="8" rx="2" fill="#0284C7"/><path d="M41 18h18v10l7 14v42a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V42l7-14z" fill="#7DD3FC" stroke="#0284C7" stroke-width="2"/><rect x="35" y="54" width="30" height="18" rx="2" fill="#FFFFFF"/>`,
    "p-pain": `<ellipse cx="50" cy="55" rx="32" ry="22" fill="#B45309"/><path d="M24 50q12-14 28-14t24 14" fill="#D97706"/><path d="M34 46l4-8M50 42l4-8M66 46l4-8" stroke="#FCD34D" stroke-width="3" stroke-linecap="round"/>`,
    "p-sukkar": `<path d="M30 22h40l4 62H26z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2"/><rect x="29" y="44" width="42" height="18" fill="#DC2626"/><path d="M38 34h24" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>`,
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
}: {
  store: StoreType;
  tab: MerchantTab;
  setTab: (t: MerchantTab) => void;
  onProfile: () => void;
  notify: (m: string) => void;
}) {
  const [shopName, setShopName] = useState("Ma boutique");

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await listMyShops();
      if (alive && res.ok && res.data.length) setShopName(res.data[0].shop_name);
    })();
    return () => { alive = false; };
  }, []);

  const storeName = shopName;

  return (
    <>
      <MerchantHeader
        name={storeName}
        onProfile={onProfile}
      />
      <main
        className={cx(
          "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-2",
          tab === "caisse" ? "flex overflow-hidden pb-0" : "pb-24",
        )}
      >
        {tab === "caisse" && <Caisse store={store} notify={notify} merchantName={storeName} />}
        {tab === "kridi" && <MerchantKridi store={store} notify={notify} />}
        {tab === "stock" && <MerchantStock store={store} notify={notify} />}
        {tab === "cartes" && <MerchantCards store={store} notify={notify} />}
        {tab === "recharges" && <MerchantRecharges notify={notify} />}
        {tab === "promos" && <MerchantOffers notify={notify} />}
        {tab === "orders" && <MerchantOrders notify={notify} />}
        {tab === "bilan" && <Bilan store={store} />}
      </main>
      <TabBar value={tab} onChange={setTab} items={MERCHANT_TABS} columns={8} />
    </>
  );
}

function MerchantHeader({
  name,
  onProfile,
}: {
  name: string;
  onProfile: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-[#E2E8F0] bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center gap-3">
        <Avatar name={name} square />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]">
            Espace commerçant
          </p>
          <p className="truncate text-[15px] font-bold text-[#0F172A]">{name}</p>
        </div>
        <button
          onClick={onProfile}
          aria-label="Mon profil"
          className="rounded-full bg-[#FF7A1A] px-2.5 py-1.5 text-[11px] font-bold text-white"
        >
          Profil
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
}: {
  store: StoreType;
  notify: (m: string) => void;
  merchantName?: string;
}) {
  const [msgs, setMsgs] = useState<VoiceMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking">("idle");
  const [lang, setLang] = useState<"darija" | "tachelhit">(() => getAiLang());
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

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* ---------------- fil de discussion (style AgentChat) ---------------- */}
      <div ref={threadRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">

        {msgs.length === 0 && phase === "idle" && (
          <div className="animate-fade-up flex min-h-[32%] flex-col items-center justify-center py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF1EA] text-[#FF5200]">
              <Zap size={30} fill="currentColor" />
            </div>
            <p className="mt-4 text-[16px] font-bold text-[#0F172A]">Message</p>
            <p className="mt-1 text-[11.5px] text-[#64748B]">Écris ta commande.</p>
          </div>
        )}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="animate-fade-up flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-br-md bg-[#FF5200] px-3.5 py-2.5 text-[12.5px] font-medium leading-snug text-white shadow-sm">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
                <Zap size={13} fill="currentColor" />
              </span>
              <div className="min-w-0 max-w-[86%] flex-1 space-y-2">
                {m.text && (
                  <div
                    className={cx(
                      "animate-fade-up rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[12px] font-medium leading-snug shadow-sm",
                      m.kind === "error"
                        ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                        : m.kind === "success"
                          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]"
                          : "border-[#E2E8F0] bg-white text-[#0F172A]",
                    )}
                  >
                    {m.text}
                  </div>
                )}
                {m.products && m.products.length > 0 && (
                  <p className="px-1 text-[10.5px] text-[#64748B]">
                    {m.products.map((c) => `${c.qty}× ${c.name}`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ),
        )}

        {phase === "thinking" && (
          <div className="flex items-center gap-2 text-[11.5px] font-medium text-[#64748B]">
            <Loader2 size={16} className="animate-spin text-[#FF5200]" />
            …
          </div>
        )}
      </div>

      {/* ---------------- barre ticket (haute, comme AgentChat) ---------------- */}
      <div className="relative border-t border-[#E2E8F0] bg-white px-4 py-3">
        {celebrate && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="animate-popIn absolute h-1.5 w-1.5 rounded-full bg-[#FF5200]"
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
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Ticket #{store.ticketNo} · {store.cart.length} article
              {store.cart.length > 1 ? "s" : ""}
            </p>
            <p key={store.cartTotal} className="animate-popIn font-mono text-[25px] font-bold leading-tight text-[#0F172A]">
              {fmtDh(store.cartTotal)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setCancelOpen(true)}
              disabled={store.cart.length === 0}
              className="rounded-lg border border-[#E2E8F0] px-2.5 py-2 text-[10.5px] font-semibold text-[#DC2626] disabled:opacity-30"
            >
              Vider
            </button>
            <button
              onClick={() => setTicketOpen(true)}
              disabled={store.cart.length === 0}
              className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2.5 py-2 text-[10.5px] font-semibold text-[#0F172A] disabled:opacity-30"
            >
              <Receipt size={13} /> Ticket · Payer
            </button>
          </div>
        </div>
        {lastSale && (
          <div className="animate-fade-up mt-2 flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
            <span className="truncate text-[10.5px] text-[#64748B]">
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
      <div className="border-t border-[#E2E8F0] bg-white px-3 pb-[calc(58px+env(safe-area-inset-bottom))] pt-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            {(live === "listening" || live === "speaking" || live === "connecting") && (
              <>
                <span className="absolute h-11 w-11 animate-ping rounded-full border border-[#FF5200]/40" />
                <span
                  className="absolute h-11 w-11 animate-ping rounded-full border border-[#FF5200]/20"
                  style={{ animationDelay: "0.45s" }}
                />
              </>
            )}
            <button
              onClick={toggleLive}
              className={cx(
                "relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-sm transition active:scale-90",
                live === "error" ? "bg-[#DC2626]" : "bg-[#FF5200]",
              )}
              aria-label={live === "idle" ? "Appeler l'IA Gemini" : "Raccrocher l'appel IA"}
              title={live === "idle" ? "Appeler l'IA Gemini" : "Raccrocher l'appel IA"}
            >
              {live === "connecting" ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Phone size={22} />
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
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
            />
            <button
              type="submit"
              disabled={!draft.trim() || phase === "thinking"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF5200] text-white shadow-sm disabled:opacity-40"
              aria-label="Envoyer la commande"
              title="Envoyer"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
          <button
            onClick={() =>
              setLang((l) => {
                const next = l === "darija" ? "tachelhit" : "darija";
                setAiLang(next);
                return next;
              })
            }
            className="h-9 shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2 text-[9.5px] font-bold text-[#64748B]"
            title="Langue de l'assistant"
          >
            {lang === "darija" ? "Darija" : "Tachelhit"}
          </button>
        </div>
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
        onPay={(method, clientId) => {
          setPendingPay({ method, clientId });
          setConfirmOpen(true);
        }}
        onCardScan={() => setCardScanOpen(true)}
        onClose={() => setTicketOpen(false)}
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
        <p className="text-[12px] text-[#64748B]">Vider le panier ?</p>
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
        <div className="space-y-1.5 rounded-xl bg-[#F8FAFC] p-3">
          {store.cart.map((l) => {
            const p = store.productById(l.productId);
            return (
              <div key={l.productId} className="flex justify-between text-[11.5px]">
                <span className="text-[#64748B]">
                  {l.qty} × {p?.name ?? l.productId}
                </span>
                <span className="font-mono font-semibold text-[#0F172A]">
                  {fmtDh((p?.priceDh ?? 0) * l.qty)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-[#E2E8F0] pt-2 text-[14px] font-bold text-[#0F172A]">
            <span>Total</span>
            <span className="font-mono">{fmtDh(store.cartTotal)}</span>
          </div>
        </div>
        {pendingPay?.cardId && (
          <p className="mt-2 text-[11px] font-semibold text-[#0F172A]">
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
            className="absolute inset-0 bg-[#0F172A]/50"
            onClick={() => setReceiptOpen(false)}
          />
          <div className="animate-paperUnfold relative w-full max-w-[360px] rounded-sm bg-white p-5 shadow-sm">
            <button
              onClick={() => setReceiptOpen(false)}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-white shadow-sm"
              aria-label="Fermer le ticket"
            >
              <X size={14} />
            </button>
            <div className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#64748B]">
                PAYZIK · Ticket
              </p>
              <p className="mt-1 text-[16px] font-bold text-[#0F172A]">
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
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#0F172A]">
                      {p.name}
                    </span>
                    <span className="font-mono text-[11px] text-[#64748B]">×{l.qty}</span>
                    <span className="font-mono text-[12px] font-bold text-[#0F172A]">
                      {fmtDh(p.priceDh * l.qty)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              className="animate-fade-up mt-3 flex items-end justify-between border-t-2 border-dashed border-[#E2E8F0] pt-2"
              style={{ animationDelay: `${receiptItems.length * 85 + 80}ms`, animationFillMode: "both" }}
            >
              <span className="text-[13px] font-bold text-[#0F172A]">Total</span>
              <span className="animate-popIn font-mono text-[20px] font-bold text-[#0F172A]">
                {fmtDh(
                  receiptItems.reduce((s, l) => {
                    const p = store.productById(l.productId);
                    return s + (p ? p.priceDh * l.qty : 0);
                  }, 0),
                )}
              </span>
            </div>
            <p className="mt-2 text-center text-[9px] text-[#64748B]">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─</p>
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
  onPay,
  onCardScan,
  onClose,
}: {
  open: boolean;
  store: StoreType;
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
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Ticket de caisse
            </p>
            <p className="text-[15px] font-bold text-[#0F172A]">Hanout Al Baraka</p>
            <p className="text-[10.5px] text-[#64748B]">
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
            className="rounded-lg p-1.5 text-[#64748B] transition hover:bg-[#F1F5F9]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-2 border-b border-dashed border-[#E2E8F0] pb-3">
          {lines.length === 0 && (
            <p className="py-4 text-center text-[12px] text-[#64748B]">Panier vide</p>
          )}
          {lines.map((l, i) => (
            <div
              key={l.id}
              className="animate-slide-in-right flex items-center gap-2"
              style={{ animationDelay: `${i * 85}ms`, animationFillMode: "both" }}
            >
              <span className="animate-scale-in flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F1F5F9] text-sm">
                {l.image ? (
                  <img src={l.image} alt={l.name} className="h-full w-full object-cover" />
                ) : (
                  l.emoji
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#0F172A]">
                {l.qty} × {l.name}
              </span>
              <span className="font-mono text-[12px] font-bold text-[#0F172A]">
                {fmtDh(l.priceDh * l.qty)}
              </span>
            </div>
          ))}
        </div>

        <div className="animate-fade-up relative mt-3 flex items-end justify-between overflow-hidden rounded-xl bg-[#FFF1EA] px-3 py-2.5"
          style={{ animationDelay: `${lines.length * 85 + 80}ms`, animationFillMode: "both" }}
        >
          <span className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer bg-[#FF5200]/10" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
            Total
          </span>
          <span className="animate-popIn font-mono text-[26px] font-bold leading-none text-[#0F172A]">
            {fmtDh(store.cartTotal)}
          </span>
        </div>

        {creditOpen ? (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold text-[#64748B]">
              Sur quel carnet Kridi ?
            </p>
            <div className="scrollbar-thin flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {store.clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pay("kridi", c.id)}
                  className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0F172A] active:bg-[#F1F5F9]"
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
                className="h-9 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[11px] outline-none focus:border-[#FF5200]"
              />
              <Btn type="submit" variant="dark" disabled={!newClient.trim()}>
                Créer
              </Btn>
            </form>
            <button
              onClick={() => setCreditOpen(false)}
              className="text-[11px] font-semibold text-[#64748B]"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              disabled={lines.length === 0}
              onClick={() => pay("cash")}
              className="flex flex-col items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[11px] font-bold text-[#059669] active:bg-[#ECFDF5] disabled:opacity-40"
            >
              <Banknote size={17} /> Espèces
            </button>
            <button
              disabled={lines.length === 0}
              onClick={() => setCreditOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[11px] font-bold text-[#FF5200] active:bg-[#FFF1EA] disabled:opacity-40"
            >
              <BookOpen size={17} /> Kridi
            </button>
            <button
              disabled={lines.length === 0}
              onClick={onCardScan}
              className="flex flex-col items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[11px] font-bold text-[#0F172A] active:bg-[#F1F5F9] disabled:opacity-40"
            >
              <CreditCard size={17} /> Carte QR
            </button>
          </div>
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
    const msg = `Salam ${c.name}, 3andek ${fmtDh(c.debtDh)} f kridi 3and Hanout Al Baraka. Chokran 🙏`;
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
        <p className="text-[11px] text-[#64748B]">Créances Kridi en cours</p>
        <p className="mt-1 font-mono text-[26px] font-bold text-[#DC2626]">{fmtDh(total)}</p>
        <p className="text-[11px] text-[#64748B]">
          {debtors.length} client(s) à relancer
        </p>
      </Pane>

      {debtors.map((c) => (
        <Pane key={c.id} className="p-3">
          <div className="flex items-center gap-3">
            <Avatar name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-[#0F172A]">{c.name}</p>
              <p className="truncate text-[10.5px] text-[#64748B]">
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
              <p className="text-[9.5px] text-[#64748B]">{c.phone ?? "—"}</p>
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
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white py-2 text-[11px] font-bold text-[#0F172A] active:scale-95"
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
          <h2 className="text-[15px] font-bold text-[#0F172A]">Catalogue de référence</h2>
          <p className="text-[10.5px] text-[#64748B]">
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
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit…"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#FF5200]"
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
                ? "border-transparent bg-[#0F172A] text-white"
                : "border-[#E2E8F0] bg-white text-[#64748B]",
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
            className="animate-fade-up overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm"
            style={{ animationDelay: `${Math.min(i, 14) * 40}ms`, animationFillMode: "both" }}
          >
            <button
              onClick={() => setActive(p)}
              className="relative block aspect-[4/3] w-full overflow-hidden bg-[#F1F5F9]"
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
              <p className="truncate text-[11.5px] font-semibold text-[#0F172A]">{p.name}</p>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="font-mono text-[11px] font-bold text-[#FF5200]">
                  {fmtDh(p.priceDh)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => store.adjustStock(p.id, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E2E8F0] active:scale-90"
                    aria-label="Retirer un"
                  >
                    <Minus size={11} />
                  </button>
                  <button
                    onClick={() => store.adjustStock(p.id, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[#E2E8F0] active:scale-90"
                    aria-label="Ajouter un"
                  >
                    <Plus size={11} />
                  </button>
                  <button
                    onClick={() => store.adjustStock(p.id, 12)}
                    className="rounded-md border border-[#E2E8F0] px-1.5 py-0.5 text-[9.5px] font-bold text-[#0F172A] active:scale-90"
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
        className="fixed bottom-[88px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#FF5200] px-4 py-3 text-[12px] font-bold text-white shadow-lg active:scale-95"
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
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#F1F5F9]">
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
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] py-2 text-[11px] font-semibold text-[#0F172A] active:bg-[#F1F5F9]">
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
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Prix (DH)"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[12px] outline-none focus:border-[#FF5200]"
        />
        <input
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[12px] outline-none focus:border-[#FF5200]"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2 text-[11px] outline-none focus:border-[#FF5200]"
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
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-center text-[14px] outline-none focus:border-[#FF5200]"
        />
      </div>
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder="Alias darija (séparés par des virgules)"
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[11px] outline-none focus:border-[#FF5200]"
      />

      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={() => store.adjustStock(product.id, -1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] active:scale-90"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => store.adjustStock(product.id, 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] active:scale-90"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={() => store.adjustStock(product.id, 12)}
          className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-[10px] font-bold active:scale-90"
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
          <h2 className="text-[15px] font-bold text-[#0F172A]">Cartes PAYZIK</h2>
          <p className="text-[10.5px] text-[#64748B]">
            Rechargeables · QR unique · solde en direct
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-1 text-[10px] font-semibold text-[#64748B]">
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
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#64748B]">
              {k.label}
            </p>
            <p className="mt-1 font-mono text-[15px] font-bold text-[#0F172A]">{k.value}</p>
          </Pane>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom ou code de carte…"
            className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 text-[12px] outline-none focus:border-[#FF5200]"
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
              className="animate-popIn block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF5200] to-[#FF8A3D] p-4 text-left text-white shadow-md active:scale-[.99]"
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
        className="fixed bottom-[88px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#FF5200] px-4 py-3 text-[12px] font-bold text-white shadow-lg active:scale-95"
      >
        <Plus size={16} /> Nouvelle carte
      </button>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="Trouver une carte">
        <p className="text-[11.5px] text-[#64748B]">
          Saisis le code affiché sur la carte (ex. PZK-8F3K-92).
        </p>
        <input
          value={scanCode}
          onChange={(e) => setScanCode(e.target.value.toUpperCase())}
          placeholder="PZK-XXXX-XXXX"
          className="mt-2 h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] uppercase outline-none focus:border-[#FF5200]"
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
        className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (optionnel)"
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN ••••"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[12px] tracking-widest outline-none focus:border-[#FF5200]"
        />
        <input
          inputMode="numeric"
          value={initial}
          onChange={(e) => setInitial(e.target.value.replace(/\D/g, ""))}
          placeholder="Recharge (DH)"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[12px] outline-none focus:border-[#FF5200]"
        />
      </div>
      <p className="mt-2 text-[10.5px] text-[#64748B]">
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
      color: { dark: "#0F172A", light: "#FFFFFF" },
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
       <style>body{font-family:Arial;text-align:center;padding:24px;color:#0F172A}
       .code{font-size:22px;font-weight:800;letter-spacing:2px;margin:8px 0}
       .name{font-size:20px;font-weight:800}.sub{color:#64748B;font-size:12px}
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
      <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] p-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
          {qr ? <img src={qr} alt={`QR ${card.code}`} className="h-full w-full object-contain" /> : <QrPlaceholder />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
            Solde disponible
          </p>
          <p className="font-mono text-[22px] font-bold text-[#0F172A]">{fmtDh(card.balanceDh)}</p>
          <p className="truncate font-mono text-[10.5px] text-[#64748B]">{card.code}</p>
          <p className="truncate text-[10.5px] text-[#64748B]">{card.phone ?? "—"}</p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom"
            className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] outline-none focus:border-[#FF5200]"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone"
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] outline-none focus:border-[#FF5200]"
            />
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN"
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#FF5200]"
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
            <p className="mb-1.5 text-[10.5px] font-semibold text-[#64748B]">Recharger la carte</p>
            <div className="flex flex-wrap gap-1.5">
              {[20, 50, 100, 200].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={cx(
                    "rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold transition",
                    amount === v
                      ? "border-[#FF5200] bg-[#FFF1EA] text-[#FF5200]"
                      : "border-[#E2E8F0] bg-white text-[#0F172A]",
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
                className="h-8 w-20 rounded-lg border border-[#E2E8F0] bg-white px-2 font-mono text-[11px] outline-none focus:border-[#FF5200]"
              />
            </div>
            <Btn className="mt-2 w-full" onClick={recharge} disabled={typeof amount !== "number" || amount <= 0}>
              <Check size={15} /> Encaisser la recharge
            </Btn>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] font-semibold text-[#64748B]">Historique</p>
            <div className="scrollbar-thin max-h-32 space-y-1 overflow-y-auto">
              {txs.length === 0 && (
                <p className="py-2 text-center text-[11px] text-[#64748B]">Aucune opération.</p>
              )}
              {txs.map((t) => (
                <div
                  key={t.id}
                  className="animate-fade-up flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[#0F172A]">{t.label}</p>
                    <p className="text-[9.5px] text-[#64748B]">
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
        <span key={i} className={cx("rounded-[1px]", i % 3 === 0 ? "bg-[#0F172A]" : "bg-[#E2E8F0]")} />
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
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626]">
          <Users size={18} />
        </span>
        <div className="flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
            Créances Kridi en cours
          </p>
          <p className="font-mono text-[16px] font-bold text-[#DC2626]">{fmtDh(kridi)}</p>
        </div>
        <ChevronRight size={16} className="text-[#94A3B8]" />
      </Pane>

      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#0F172A]">7 derniers jours</h3>
        <div className="mt-4 flex h-32 items-end gap-1.5">
          {days.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cx(
                    "w-full rounded-t-md",
                    d.total > 0 ? "bg-[#FF5200]" : "bg-[#F1F5F9]",
                  )}
                  style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%` }}
                  title={`${d.label} · ${fmtDh(d.total)}`}
                />
              </div>
              <span className="text-[9px] font-semibold text-[#64748B]">{d.label}</span>
            </div>
          ))}
        </div>
      </Pane>

      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#0F172A]">Top produits</h3>
        {top.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-[#64748B]">
            Encaisse une vente pour voir tes meilleurs produits.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {top.map(([name, qty], i) => (
              <div key={name} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F1F5F9] text-[10px] font-bold text-[#64748B]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[#0F172A]">
                  {name}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#0F172A]">
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
      <p className="text-[11.5px] text-[#64748B]">
        Choisis le client. Le montant sera ajouté à son carnet.
      </p>
      <div className="mt-3 space-y-1.5">
        {clients.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[#E2E8F0] p-2.5 text-left active:bg-[#F8FAFC]"
          >
            <Avatar name={c.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#0F172A]">
                {c.name}
              </p>
              <p className="text-[10.5px] text-[#64748B]">
                Dette actuelle : {fmtDh(c.debtDh)}
              </p>
            </div>
            <ChevronRight size={15} className="text-[#94A3B8]" />
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
      <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] p-3">
        <Avatar name={client.name} size={38} />
        <div>
          <p className="text-[13px] font-bold text-[#0F172A]">{client.name}</p>
          <p className="text-[11px] text-[#64748B]">
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
                  : "border-[#E2E8F0] text-[#0F172A]",
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
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] outline-none focus:border-[#059669]"
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
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F1F5F9] text-3xl">
          {image ? <img src={image} alt="Aperçu" className="h-full w-full object-cover" /> : emoji}
        </div>
        <label className="flex-1 cursor-pointer rounded-xl border border-[#E2E8F0] py-2.5 text-center text-[11px] font-semibold text-[#0F172A] active:bg-[#F1F5F9]">
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
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#FF5200]"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Prix (DH)"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] outline-none focus:border-[#FF5200]"
        />
        <input
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] outline-none focus:border-[#FF5200]"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="Emoji"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-center text-[14px] outline-none focus:border-[#FF5200]"
        />
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="Alias darija"
          className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[11px] outline-none focus:border-[#FF5200]"
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
                ? "border-[#0F172A] bg-[#0F172A] text-white"
                : "border-[#E2E8F0] text-[#64748B]",
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

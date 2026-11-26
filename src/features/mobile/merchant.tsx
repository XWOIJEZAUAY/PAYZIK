/** Espace COMMERÇANT — caisse vocale, kridi, stock et bilan. */
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Check,
  ChevronRight,
  CreditCard,
  LogOut,
  MessageCircle,
  Mic,
  Minus,
  Package,
  Plus,
  Receipt,
  ScanLine,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { daysSince, fmtDh } from "../../lib/format";
import type { Profile } from "../../services/auth";
import type { Store as StoreType } from "../../state/store";
import type { Category, Client, Product } from "../../types";
import {
  Avatar,
  Btn,
  cx,
  Empty,
  IconBtn,
  Kpi,
  Pane,
  Sheet,
  StockPill,
  TabBar,
} from "./ui";

export type MerchantTab = "caisse" | "kridi" | "stock" | "bilan";

export const MERCHANT_TABS: { id: MerchantTab; label: string; icon: typeof Wallet }[] = [
  { id: "caisse", label: "Caisse", icon: ScanLine },
  { id: "kridi", label: "Carnet", icon: BookOpen },
  { id: "stock", label: "Stock", icon: Package },
  { id: "bilan", label: "Bilan", icon: TrendingUp },
];

const VOICE_PHRASES = [
  "2 bwat d'hlib w 1 kg skar",
  "3 sidi ali w pain",
  "1 zit lesieur w 2 qhwa",
  "5 bayd w 1 fromage",
];

/** Reconnaissance vocale simulée : associe les mots darija aux produits. */
function parseVoice(
  text: string,
  products: Product[],
  add: (id: string, qty?: number) => void,
) {
  const segments = text.toLowerCase().split(/\s+w\s+|\s+et\s+/);
  let added = 0;
  for (const seg of segments) {
    let best: { p: Product; len: number } | null = null;
    for (const p of products) {
      for (const k of [p.name.toLowerCase(), ...p.aliases]) {
        if (k.length >= 3 && seg.includes(k) && (!best || k.length > best.len)) {
          best = { p, len: k.length };
        }
      }
    }
    if (best) {
      const m = seg.match(/(\d+)/);
      const qty = m ? Math.max(1, parseInt(m[1], 10)) : 1;
      add(best.p.id, qty);
      added++;
    }
  }
  return added;
}

export function MerchantSpace({
  store,
  user,
  tab,
  setTab,
  onSwitch,
  onLogout,
  notify,
}: {
  store: StoreType;
  user: Profile;
  tab: MerchantTab;
  setTab: (t: MerchantTab) => void;
  onSwitch: () => void;
  onLogout: () => void;
  notify: (m: string) => void;
}) {
  const storeName =
    user.role === "merchant" && user.name ? user.name : "Hanout Al Baraka";

  return (
    <>
      <MerchantHeader
        name={storeName}
        onSwitch={onSwitch}
        onLogout={onLogout}
      />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {tab === "caisse" && <Caisse store={store} notify={notify} />}
        {tab === "kridi" && <MerchantKridi store={store} notify={notify} />}
        {tab === "stock" && <MerchantStock store={store} notify={notify} />}
        {tab === "bilan" && <Bilan store={store} />}
      </main>
      <TabBar value={tab} onChange={setTab} items={MERCHANT_TABS} />
    </>
  );
}

function MerchantHeader({
  name,
  onSwitch,
  onLogout,
}: {
  name: string;
  onSwitch: () => void;
  onLogout: () => void;
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
        <IconBtn onClick={onLogout} label="Déconnexion">
          <LogOut size={16} />
        </IconBtn>
        <IconBtn onClick={onSwitch} label="Changer de profil">
          <ArrowLeftRight size={17} />
        </IconBtn>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Caisse vocale                                                        */
/* ------------------------------------------------------------------ */

function Caisse({
  store,
  notify,
}: {
  store: StoreType;
  notify: (m: string) => void;
}) {
  const [voice, setVoice] = useState(false);
  const [heard, setHeard] = useState("");
  const [kridiOpen, setKridiOpen] = useState(false);
  const phraseRef = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const runVoice = () => {
    if (voice) return;
    const text = VOICE_PHRASES[phraseRef.current % VOICE_PHRASES.length];
    phraseRef.current += 1;
    setVoice(true);
    setHeard("");
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = window.setTimeout(() => {
        setHeard(text.slice(0, Math.ceil((text.length * i) / steps)));
        if (i === steps) {
          const n = parseVoice(text, store.products, store.addToCart);
          setVoice(false);
          notify(n > 0 ? `Ajouté : ${text}` : "Rien compris, réessaie");
        }
      }, i * 110);
      timers.current.push(t);
    }
  };

  const frequent = ["p-lait", "p-sidiali", "p-pain", "p-sukkar", "p-coca", "p-the"]
    .map((id) => store.productById(id))
    .filter((p): p is Product => !!p);

  return (
    <div className="animate-fade-up space-y-3">
      <Pane className="flex flex-col items-center p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
          Caisse vocale Darija
        </p>
        <button
          onClick={runVoice}
          className={cx(
            "relative mt-3 flex h-20 w-20 items-center justify-center rounded-full bg-[#FF5200] text-white shadow-lg transition active:scale-95",
            voice && "animate-pulse",
          )}
          aria-label="Démarrer la dictée"
        >
          <Mic size={30} />
        </button>
        <div className="mt-3 flex h-5 items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cx(
                "w-1 rounded-full bg-[#FF5200]",
                voice ? "h-5 animate-wave" : "h-1.5 opacity-30",
              )}
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="mt-1 min-h-[18px] text-center text-[12px] font-medium text-[#0F172A]">
          {heard || (voice ? "J'écoute…" : "Appuie et parle")}
        </p>
      </Pane>

      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
          Produits fréquents
        </p>
        <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
          {frequent.map((p) => (
            <button
              key={p.id}
              onClick={() => store.addToCart(p.id)}
              className="flex shrink-0 flex-col items-start rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 shadow-sm active:scale-95"
            >
              <span className="max-w-[110px] truncate text-[12px] font-semibold text-[#0F172A]">
                {p.name}
              </span>
              <span className="font-mono text-[11px] font-bold text-[#FF5200]">
                {fmtDh(p.priceDh)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Pane className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[#0F172A]">Ticket en cours</h3>
          <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
            {store.cart.length} article(s)
          </span>
        </div>

        {store.cart.length === 0 ? (
          <Empty
            icon={<Receipt size={22} />}
            title="Panier vide"
            hint="Ajoute un produit ou utilise la voix."
          />
        ) : (
          <div className="mt-2 divide-y divide-[#F1F5F9]">
            {store.cart.map((l) => {
              const p = store.productById(l.productId);
              if (!p) return null;
              return (
                <div key={l.productId} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#0F172A]">
                      {p.name}
                    </p>
                    <p className="font-mono text-[10.5px] text-[#64748B]">
                      {fmtDh(p.priceDh)} × {l.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => store.setQty(l.productId, l.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0F172A] active:scale-90"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-5 text-center font-mono text-[12px] font-bold text-[#0F172A]">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => store.setQty(l.productId, l.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0F172A] active:scale-90"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="w-16 text-right font-mono text-[12px] font-bold text-[#0F172A]">
                    {fmtDh(p.priceDh * l.qty)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 space-y-1 border-t border-[#E2E8F0] pt-2">
          <div className="flex justify-between text-[12px] text-[#64748B]">
            <span>Sous-total</span>
            <span className="font-mono">{fmtDh(store.cartTotal)}</span>
          </div>
          <div className="flex justify-between text-[16px] font-bold text-[#0F172A]">
            <span>Total</span>
            <span className="font-mono">{fmtDh(store.cartTotal)}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn
            variant="green"
            disabled={store.cart.length === 0}
            onClick={() => {
              const sale = store.checkout("cash");
              if (sale) notify(`Encaissé ${fmtDh(sale.totalDh)}`);
            }}
          >
            <Check size={15} /> Encaisser {fmtDh(store.cartTotal)}
          </Btn>
          <Btn
            variant="dark"
            disabled={store.cart.length === 0}
            onClick={() => setKridiOpen(true)}
          >
            Inscrire au Kridi
          </Btn>
        </div>
      </Pane>

      <KridiPickModal
        open={kridiOpen}
        clients={store.clients}
        onClose={() => setKridiOpen(false)}
        onPick={(c) => {
          const sale = store.checkout("kridi", c.id);
          if (sale) notify(`${fmtDh(sale.totalDh)} inscrit au kridi de ${c.name}`);
          setKridiOpen(false);
        }}
      />
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
  const [open, setOpen] = useState(false);
  const list =
    cat === "all" ? store.products : store.products.filter((p) => p.category === cat);
  const alerts = store.products.filter((p) => p.stock <= 5).length;

  return (
    <div className="animate-fade-up space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[#0F172A]">
          {store.products.length} références
        </h2>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#DC2626]">
          <AlertTriangle size={13} /> {alerts} alertes
        </span>
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

      <div className="space-y-2">
        {list.map((p) => (
          <Pane key={p.id} className="flex items-center gap-2.5 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[10px] font-bold text-[#64748B]">
              {p.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[#0F172A]">{p.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="font-mono text-[10.5px] text-[#64748B]">
                  {fmtDh(p.priceDh)}
                </span>
                <StockPill stock={p.stock} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => store.adjustStock(p.id, -1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0F172A] active:scale-90"
                aria-label="Retirer un"
              >
                <Minus size={12} />
              </button>
              <button
                onClick={() => store.adjustStock(p.id, 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#0F172A] active:scale-90"
                aria-label="Ajouter un"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={() => store.adjustStock(p.id, 12)}
                className="rounded-lg border border-[#E2E8F0] px-1.5 py-1 text-[10px] font-bold text-[#0F172A] active:scale-90"
              >
                +12
              </button>
            </div>
          </Pane>
        ))}
      </div>

      {list.length === 0 && (
        <Empty icon={<Package size={22} />} title="Aucun produit" hint="Change de catégorie." />
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[88px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#FF5200] px-4 py-3 text-[12px] font-bold text-white shadow-lg active:scale-95"
      >
        <Plus size={16} /> Nouveau produit
      </button>

      <AddProductModal
        open={open}
        onClose={() => setOpen(false)}
        onAdd={(p) => {
          store.addProduct(p);
          notify(`Produit ajouté : ${p.name}`);
          setOpen(false);
        }}
      />
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

  const submit = () => {
    if (!name.trim() || !price) return;
    onAdd({
      name: name.trim(),
      priceDh: Number(price),
      stock: Number(stock) || 0,
      category,
      emoji: "📦",
      aliases: [name.trim().toLowerCase()],
    });
    setName("");
    setPrice("");
    setStock("");
    setCategory("Épicerie");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nouveau produit">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du produit"
        className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#FF5200]"
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
        <Plus size={15} /> Ajouter au stock
      </Btn>
    </Sheet>
  );
}

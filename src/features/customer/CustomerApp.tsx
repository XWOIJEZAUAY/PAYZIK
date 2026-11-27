/** Espace Utilisateur PAYZIK : carte, solde, offres du réseau et tableau de bord. */
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  Clock,
  Coffee,
  CreditCard,
  Gift,
  MapPin,
  Megaphone,
  Minus,
  Pill,
  Plus,
  QrCode as QrIcon,
  Receipt,
  Search,
  ShoppingBasket,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BoltIcon } from "../../components/brand/Logo";
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Input,
  Modal,
  QrCode,
  StatCard,
  StatusDot,
} from "../../components/ui";
import { fmtDh } from "../../lib/format";
import type { Store as StoreType } from "../../state/store";
import { useNetwork } from "../../state/network";
import type {
  Ad,
  Establishment,
  EstablishmentKind,
  MenuItem,
  RestaurantOrder,
  Tone,
  WalletCard,
} from "../../types";

type Tab = "home" | "wallet" | "network" | "dashboard";

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: "home", label: "Accueil", icon: Sparkles },
  { id: "wallet", label: "Ma carte", icon: CreditCard },
  { id: "network", label: "Commerçants & offres", icon: Store },
  { id: "dashboard", label: "Tableau de bord", icon: TrendingUp },
];

const KIND_META: Record<
  EstablishmentKind,
  { label: string; icon: typeof Store }
> = {
  hanout: { label: "Hanout", icon: Store },
  epicerie: { label: "Épicerie", icon: ShoppingBasket },
  pharmacie: { label: "Pharmacie", icon: Pill },
  cafe: { label: "Café", icon: Coffee },
  patisserie: { label: "Pâtisserie", icon: ShoppingBasket },
};

const TONE: Record<
  Tone,
  { grad: string; soft: string; text: string; ring: string; dot: string }
> = {
  navy: {
    grad: "from-orange-deep via-orange to-orange-glow",
    soft: "bg-orange/10",
    text: "text-orange-deep",
    ring: "ring-orange/25",
    dot: "bg-orange",
  },
  teal: {
    grad: "from-teal-deep via-teal to-teal-glow",
    soft: "bg-teal/10",
    text: "text-teal-deep",
    ring: "ring-teal/25",
    dot: "bg-teal",
  },
  amber: {
    grad: "from-[#4A2B05] via-[#A9670B] to-[#F59E0B]",
    soft: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  rose: {
    grad: "from-[#4C0519] via-[#9F1239] to-[#F43F5E]",
    soft: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
    dot: "bg-rose-500",
  },
  indigo: {
    grad: "from-[#7A2E00] via-[#D95F00] to-[#FF7A1A]",
    soft: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
    dot: "bg-indigo-500",
  },
};

const STATUS_LABEL: Record<RestaurantOrder["status"], string> = {
  new: "En cuisine",
  preparing: "En préparation",
  served: "Servi",
};

export function CustomerApp({
  store,
  onSwitchProfile,
}: {
  store: StoreType;
  onSwitchProfile: () => void;
}) {
  const network = useNetwork();
  const [tab, setTab] = useState<Tab>("home");
  const [payTarget, setPayTarget] = useState<Establishment | null>(null);
  const [menuTarget, setMenuTarget] = useState<Establishment | null>(null);
  const [notice, setNotice] = useState("");

  const card =
    store.cards.find((c) => c.code === network.customer.cardCode) ?? store.cards[0];

  const txs = card ? store.cardTxFor(card.id) : [];

  const stats = useMemo(() => {
    const pay = txs.filter((t) => t.type === "pay");
    const topups = txs.filter(
      (t) => t.type === "topup" && !t.label.startsWith("Cashback"),
    );
    const cashback = txs.filter((t) => t.label.startsWith("Cashback"));
    return {
      spent: pay.reduce((s, t) => s + t.amountDh, 0),
      topped: topups.reduce((s, t) => s + t.amountDh, 0),
      cashback: cashback.reduce((s, t) => s + t.amountDh, 0),
      txCount: txs.length,
    };
  }, [txs]);

  const activeOrders = network.orders.filter(
    (o) =>
      (o.status !== "served" || !o.paid) &&
      (o.customerName ?? "").toLowerCase() === network.customer.name.toLowerCase(),
  );

  const myOrders = network.orders.filter(
    (o) => (o.customerName ?? "").toLowerCase() === network.customer.name.toLowerCase(),
  );

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const handlePay = (target: Establishment, amount: number) => {
    if (!card) return "Aucune carte PAYZIK sur ce compte.";
    if (amount <= 0) return "Saisis un montant valide.";
    if (amount > card.balanceDh)
      return `Solde insuffisant (${fmtDh(card.balanceDh)} disponibles). Recharge ta carte.`;
    const ok = store.payWithCard(card.id, amount, `Paiement ${target.name}`);
    if (!ok) return "Paiement refusé par la carte.";
    const cashback = Math.round(((amount * target.cashbackPct) / 100) * 100) / 100;
    if (cashback >= 1) store.topUpCard(card.id, cashback, `Cashback ${target.name}`);
    flash(
      `${fmtDh(amount)} payés chez ${target.name}${
        cashback >= 1 ? ` · +${fmtDh(cashback)} cashback` : ""
      }`,
    );
    setPayTarget(null);
    return null;
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------------- barre haute ---------------- */}
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BoltIcon size={26} />
            <span className="text-[19px] font-black tracking-tight text-ink">PAYZIK</span>
          </div>
          <span className="hidden rounded-full border border-orange/25 bg-orange/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-deep sm:inline">
            Espace client
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-ink/10 bg-sand/70 px-3 py-1.5 text-[11px] font-semibold text-muted md:inline-flex">
              <Wifi size={12} className="text-orange" /> Réseau connecté ·{" "}
              {network.establishments.length} partenaires
            </span>
            <Button
              variant="ghost"
              onClick={onSwitchProfile}
              className="!px-3 !py-2 text-xs !text-muted hover:!bg-orange/10 hover:!text-orange-deep"
            >
              Changer de profil
            </Button>
          </div>
        </div>

        {/* onglets */}
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-0 sm:px-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
                tab === id ? "text-orange-deep" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={15} className={tab === id ? "text-orange" : ""} />
              {label}
              {tab === id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-orange" />
              )}
            </button>
          ))}
        </div>
      </header>

      {notice && (
        <div className="fixed left-1/2 top-20 z-50 w-[min(92vw,480px)] -translate-x-1/2 animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-pop">
          <span className="flex items-center gap-2">
            <Check size={16} /> {notice}
          </span>
        </div>
      )}

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {tab === "home" && (
          <HomeView
            customerName={network.customer.name}
            card={card}
            stats={stats}
            ads={network.ads}
            establishments={network.establishments}
            orders={activeOrders}
            onWallet={() => setTab("wallet")}
            onNetwork={() => setTab("network")}
            onPay={setPayTarget}
            onTopUp={() => setTab("wallet")}
          />
        )}
        {tab === "wallet" && card && (
          <WalletView
            store={store}
            card={card}
            txs={store.cardTxFor(card.id)}
            cashback={stats.cashback}
            customerName={network.customer.name}
            phone={network.customer.phone}
            city={network.customer.city}
            onSaveProfile={network.updateCustomer}
            onNotice={flash}
          />
        )}
        {tab === "wallet" && !card && (
          <EmptyState
            icon={<CreditCard size={22} />}
            title="Aucune carte PAYZIK"
            hint="Crée une carte depuis l'espace commerçant pour commencer."
          />
        )}
        {tab === "network" && (
          <NetworkView
            establishments={network.establishments}
            ads={network.ads}
            orders={network.orders}
            onPay={setPayTarget}
          />
        )}
        {tab === "dashboard" && (
          <DashboardView
            card={card}
            txs={txs}
            stats={stats}
            orders={myOrders}
          />
        )}
      </main>

      <PayModal
        target={payTarget}
        card={card}
        onClose={() => setPayTarget(null)}
        onConfirm={handlePay}
        onTopUp={() => {
          setPayTarget(null);
          setTab("wallet");
        }}
      />

      <MenuModal
        target={menuTarget}
        menu={network.menu}
        onClose={() => setMenuTarget(null)}
      />

      <footer className="border-t bg-surface px-4 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck size={13} className="text-teal-deep" /> Carte PAYZIK acceptée
            chez tous les partenaires du réseau
          </span>
          <span>© {new Date().getFullYear()} PAYZIK — espace utilisateur</span>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   ACCUEIL
   ================================================================ */

function HomeView({
  customerName,
  card,
  stats,
  ads,
  establishments,
  orders,
  onWallet,
  onNetwork,
  onPay,
  onTopUp,
}: {
  customerName: string;
  card?: WalletCard;
  stats: { spent: number; topped: number; cashback: number; txCount: number };
  ads: Ad[];
  establishments: Establishment[];
  orders: RestaurantOrder[];
  onWallet: () => void;
  onNetwork: () => void;
  onPay: (e: Establishment) => void;
  onTopUp: () => void;
}) {
  const nearby = [...establishments].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 4);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-deep">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Salam {customerName} — tout est connecté.
          </h1>
          <p className="mt-1 text-sm text-muted">
            Ta carte, tes offres et tes commerces préférés au même endroit.
          </p>
        </div>
        <StatusDot tone="emerald">Paiements en direct</StatusDot>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-5">
          {/* carte + actions */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-night-deep via-night to-orange-deep p-5 text-white shadow-pop sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal/20 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">
                  <CreditCard size={13} /> Ma carte PAYZIK
                </p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Solde disponible
                </p>
                <p className="money mt-1 text-4xl font-black leading-none">
                  {card ? fmtDh(card.balanceDh) : "—"}
                </p>
                <p className="mt-2 flex items-center gap-2 text-[11px] text-white/50">
                  <span className="tnum rounded-md bg-white/10 px-2 py-0.5">
                    {card?.code ?? "Aucune carte"}
                  </span>
                  {card?.phone && <span>{card.phone}</span>}
                </p>
              </div>
              {card && (
                <div className="rounded-2xl bg-white p-2 shadow-lg">
                  <QrCode value={card.code} size={86} />
                </div>
              )}
            </div>
            <div className="relative mt-5 flex flex-wrap gap-2">
              <Button variant="accent" className="!py-2.5" onClick={onTopUp}>
                <Plus size={15} /> Recharger
              </Button>
              <Button
                variant="secondary"
                className="!border-white/15 !bg-white/10 !py-2.5 !text-white hover:!bg-white/20"
                onClick={onWallet}
              >
                <Wallet size={15} /> Mon portefeuille
              </Button>
              <Button
                variant="ghost"
                className="!py-2.5 !text-white/70 hover:!bg-white/10 hover:!text-white"
                onClick={onNetwork}
              >
                Payer un commerçant <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* carrousel de pubs */}
          <AdCarousel ads={ads} onCta={onNetwork} />

          {/* commerces proches */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-extrabold tracking-tight text-ink">
                  Autour de toi
                </h2>
                <p className="text-xs text-muted">Les partenaires les plus proches</p>
              </div>
              <button
                onClick={onNetwork}
                className="text-xs font-bold text-teal-deep hover:underline"
              >
                Tout voir
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {nearby.map((e) => (
                <MiniEstablishment key={e.id} e={e} onPay={() => onPay(e)} />
              ))}
            </div>
          </section>
        </div>

        {/* colonne droite */}
        <aside className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Dépensé" value={fmtDh(stats.spent)} icon={<Receipt size={14} />} />
            <MiniStat
              label="Cashback"
              value={fmtDh(stats.cashback)}
              icon={<Gift size={14} />}
              tone="teal"
            />
            <MiniStat label="Opérations" value={String(stats.txCount)} icon={<TrendingUp size={14} />} />
          </div>

          {/* commandes restaurant en direct */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
                Commandes en cours
              </h3>
              <Badge tone="teal" icon={<Clock size={11} />}>
                {orders.length}
              </Badge>
            </div>
            {orders.length === 0 ? (
              <p className="rounded-xl bg-surface2 px-3 py-4 text-center text-xs text-muted">
                Aucune commande active. Choisis ta table chez Dar Zitoun.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 3).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 rounded-xl border bg-surface2/50 px-3 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy text-[13px] font-black text-orange-glow">
                      {o.tableNo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold text-ink">
                        Table {o.tableNo} · {o.lines.length} plat{o.lines.length > 1 ? "s" : ""}
                      </p>
                      <p className="text-[10.5px] text-muted">
                        {STATUS_LABEL[o.status]} · {o.paid ? "Payé" : "À encaisser"}
                      </p>
                    </div>
                    <span className="money text-[12px] font-black text-ink">
                      {fmtDh(o.totalDh)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* pubs empilées */}
          <div className="space-y-3">
            {ads.slice(3, 6).map((ad) => (
              <AdRow key={ad.id} ad={ad} onClick={onNetwork} />
            ))}
          </div>

          <div className="rounded-2xl border border-teal/25 bg-accent-soft/60 p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-teal-deep">
              <Megaphone size={13} /> Bon à savoir
            </p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink">
              Paie avec ta carte PAYZIK chez tous les partenaires et récupère jusqu'à 6% de
              cashback.
            </p>
            <button
              onClick={onNetwork}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-teal-deep hover:underline"
            >
              Voir les commerces <ArrowRight size={12} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "teal";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "teal" ? "border-teal/25 bg-accent-soft/50" : "bg-surface",
      )}
    >
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        {icon} {label}
      </p>
      <p
        className={cn(
          "money mt-1 truncate text-[15px] font-black",
          tone === "teal" ? "text-teal-deep" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniEstablishment({
  e,
  onPay,
}: {
  e: Establishment;
  onPay: () => void;
}) {
  const meta = KIND_META[e.kind];
  const Icon = meta.icon;
  const tone = TONE[e.tone];
  return (
    <div className="group rounded-2xl border bg-surface p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            tone.grad,
          )}
        >
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-extrabold text-ink">{e.name}</p>
          <p className="text-[11px] text-muted">
            {meta.label} · {e.district}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-muted">
            <Star size={10} className="fill-amber-400 text-amber-400" />
            {e.rating.toFixed(1)} · {e.reviews} avis · {e.distanceKm} km
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal-deep">
          {e.cashbackPct}% cashback
        </span>
        <button
          onClick={onPay}
          className="rounded-lg bg-navy px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-navy-soft"
        >
          Payer
        </button>
      </div>
    </div>
  );
}

/* ---------------- carrousel publicitaire ---------------- */
function AdCarousel({ ads, onCta }: { ads: Ad[]; onCta: () => void }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % ads.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [ads.length]);

  const ad = ads[i % ads.length];
  const tone = TONE[ad.tone];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-card sm:p-6",
        tone.grad,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
      <div className="relative max-w-lg">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
          <Megaphone size={12} /> {ad.eyebrow} · sponsorisé
        </p>
        <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-[28px]">
          {ad.title}
        </h2>
        <p className="mt-1.5 text-[13px] text-white/75">{ad.subtitle}</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onCta}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[12px] font-black text-navy transition-transform hover:scale-[1.02]"
          >
            {ad.cta} <ArrowRight size={13} />
          </button>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
            {ad.sponsor}
          </span>
        </div>
      </div>
      <div className="relative mt-5 flex items-center gap-1.5">
        {ads.map((a, n) => (
          <button
            key={a.id}
            onClick={() => setI(n)}
            aria-label={`Publicité ${n + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              n === i % ads.length ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function AdRow({ ad, onClick }: { ad: Ad; onClick: () => void }) {
  const tone = TONE[ad.tone];
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop"
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white",
          tone.grad,
        )}
      >
        <Gift size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {ad.eyebrow} · {ad.sponsor}
        </p>
        <p className="truncate text-[12.5px] font-bold text-ink">{ad.title}</p>
      </div>
      <ArrowRight
        size={15}
        className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

/* ================================================================
   MA CARTE / PORTEFEUILLE
   ================================================================ */

function WalletView({
  store: _store,
  card,
  txs,
  cashback: _cashback,
  customerName,
  phone,
  city,
  onSaveProfile,
  onNotice,
}: {
  store: StoreType;
  card: WalletCard;
  txs: { id: string; type: "topup" | "pay"; amountDh: number; label: string; at: string }[];
  cashback: number;
  customerName: string;
  phone: string;
  city: string;
  onSaveProfile: (patch: { name?: string; phone?: string; city?: string }) => void;
  onNotice: (msg: string) => void;
}) {
  const [name, setName] = useState(customerName);
  const [tel, setTel] = useState(phone);
  const [town, setTown] = useState(city);

  const save = () => {
    onSaveProfile({ name: name.trim() || customerName, phone: tel.trim(), city: town.trim() });
    onNotice("Profil mis à jour.");
  };

  return (
    <div className="animate-fade-up grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        {/* carte */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-night-deep via-night to-orange-deep p-6 text-white shadow-pop">
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-teal/20 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
              <CreditCard size={14} /> Carte PAYZIK
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]">
              Active
            </span>
          </div>
          <p className="relative mt-8 text-[11px] font-semibold uppercase tracking-wider text-white/45">
            Solde disponible
          </p>
          <p className="money relative mt-1 text-5xl font-black leading-none">
            {fmtDh(card.balanceDh)}
          </p>
          <div className="relative mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Titulaire
              </p>
              <p className="text-sm font-bold">{card.name}</p>
              <p className="tnum mt-1 text-[11px] text-white/55">{card.code}</p>
            </div>
            <div className="rounded-2xl bg-white p-2 shadow-lg">
              <QrCode value={card.code} size={92} />
            </div>
          </div>
          <div className="relative mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            <span className="flex items-center gap-1.5">
              <QrIcon size={12} /> QR unique accepté partout
            </span>
            <span>PAYZIK · réseau</span>
          </div>
        </div>

        {/* profil */}
        <Card className="p-4">
          <h3 className="text-[13px] font-extrabold tracking-tight text-ink">Mon profil</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                Nom
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                Téléphone
              </span>
              <Input value={tel} onChange={(e) => setTel(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                Ville
              </span>
              <Input value={town} onChange={(e) => setTown(e.target.value)} />
            </label>
          </div>
          <Button variant="primary" className="mt-3" onClick={save}>
            <Check size={15} /> Enregistrer
          </Button>
        </Card>
      </div>

      {/* historique */}
      <Card className="flex min-h-[420px] flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
            Historique de la carte
          </h3>
          <Badge tone="slate">{txs.length} opérations</Badge>
        </div>
        {txs.length === 0 ? (
          <EmptyState
            icon={<Receipt size={20} />}
            title="Aucune opération"
            hint="Recharge ta carte ou paie chez un partenaire pour voir l'historique."
            className="flex-1"
          />
        ) : (
          <div className="scrollbar-thin max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {txs.map((t) => {
              const up = t.type === "topup";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border bg-surface2/40 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      up
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600",
                    )}
                  >
                    {up ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-ink">{t.label}</p>
                    <p className="text-[10.5px] text-muted">
                      {new Date(t.at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "money shrink-0 text-[13px] font-black",
                      up ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {up ? "+" : "−"}
                    {fmtDh(t.amountDh)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================================================================
   COMMERÇANTS & OFFRES
   ================================================================ */

type KindFilter = "all" | EstablishmentKind;

function NetworkView({
  establishments,
  ads,
  orders,
  onPay,
}: {
  establishments: Establishment[];
  ads: Ad[];
  orders: RestaurantOrder[];
  onPay: (e: Establishment) => void;
}) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const [q, setQ] = useState("");

  const list = establishments.filter((e) => {
    const okKind = filter === "all" || e.kind === filter;
    const okQ =
      !q.trim() ||
      e.name.toLowerCase().includes(q.toLowerCase()) ||
      e.city.toLowerCase().includes(q.toLowerCase()) ||
      e.district.toLowerCase().includes(q.toLowerCase());
    return okKind && okQ;
  });

  const filters: { id: KindFilter; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "hanout", label: "Hanouts" },
    { id: "epicerie", label: "Épiceries" },
    { id: "pharmacie", label: "Pharmacies" },
    { id: "cafe", label: "Cafés" },
    { id: "patisserie", label: "Pâtisseries" },
  ];

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink">
            Tous les commerces du réseau
          </h1>
          <p className="text-sm text-muted">
            Paie avec ta carte PAYZIK et cumule du cashback chez chaque partenaire.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un commerce…"
              className="h-10 w-56 rounded-xl border bg-surface pl-8 pr-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all",
              filter === f.id
                ? "border-transparent bg-orange text-night"
                : "bg-surface text-muted hover:border-teal/40 hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e, i) => (
          <div key={e.id} className="contents">
            <EstablishmentCard
              e={e}
              orders={e.id === "e-darzitoun" ? orders : []}
              onPay={() => onPay(e)}
            />
            {(i + 1) % 4 === 0 && ads[Math.floor(i / 4) % ads.length] && (
              <SponsoredCard ad={ads[Math.floor(i / 4) % ads.length]} />
            )}
          </div>
        ))}
      </div>

      {list.length === 0 && (
        <EmptyState
          icon={<Search size={20} />}
          title="Aucun commerce trouvé"
          hint="Essaie un autre nom, une autre ville ou un autre filtre."
        />
      )}
    </div>
  );
}

function EstablishmentCard({
  e,
  orders,
  onPay,
}: {
  e: Establishment;
  orders: RestaurantOrder[];
  onPay: () => void;
}) {
  const meta = KIND_META[e.kind];
  const Icon = meta.icon;
  const tone = TONE[e.tone];
  const active = orders.filter((o) => o.status !== "served").length;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
      <div className={cn("relative h-20 bg-gradient-to-br", tone.grad)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,248,234,0.25),transparent_55%)]" />
        <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
          <Icon size={18} />
        </span>
        {e.promo && (
          <span className="absolute bottom-2 left-3 max-w-[80%] truncate rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold text-navy">
            {e.promo}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-night/30 px-2 py-0.5 text-[10px] font-bold text-cream backdrop-blur">
          {e.cashbackPct}% cashback
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold text-ink">{e.name}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted">
              <MapPin size={10} /> {e.district}, {e.city} · {e.distanceKm} km
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-ink">
            <Star size={11} className="fill-amber-400 text-amber-400" />
            {e.rating.toFixed(1)}
          </span>
        </div>

        <p className="mt-1 text-[10.5px] text-muted">
          {meta.label} · {e.reviews} avis
          {active > 0 ? ` · ${active} actif(s)` : ""}        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {e.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold text-muted"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 pt-1">
          <Button variant="primary" className="flex-1 !py-2 text-[12px]" onClick={onPay}>
            <CreditCard size={13} /> Payer
          </Button>
          {/* pas de menu restaurant — commerces uniquement */}
        </div>
      </div>
    </div>
  );
}

function SponsoredCard({ ad }: { ad: Ad }) {
  const tone = TONE[ad.tone];
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-card",
        tone.grad,
      )}
    >
      <div>
        <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70">
          <Megaphone size={11} /> Sponsorisé
        </p>
        <p className="mt-2 text-[15px] font-black leading-tight">{ad.title}</p>
        <p className="mt-1 text-[11.5px] text-white/70">{ad.subtitle}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
          {ad.sponsor}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-[11px] font-bold backdrop-blur">
          {ad.cta} <ArrowRight size={11} />
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   TABLEAU DE BORD
   ================================================================ */

function DashboardView({
  card,
  txs,
  stats,
  orders,
}: {
  card?: WalletCard;
  txs: { id: string; type: "topup" | "pay"; amountDh: number; label: string; at: string }[];
  stats: { spent: number; topped: number; cashback: number; txCount: number };
  orders: RestaurantOrder[];
}) {
  const days = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const total = txs
        .filter((t) => t.type === "pay" && new Date(t.at).toDateString() === key)
        .reduce((s, t) => s + t.amountDh, 0);
      out.push({
        label: d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3),
        total,
      });
    }
    return out;
  }, [txs]);

  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const merchants = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== "pay") continue;
      const name = t.label.replace(/^Paiement\s+/, "");
      map.set(name, (map.get(name) ?? 0) + t.amountDh);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [txs]);

  const avg = txs.filter((t) => t.type === "pay").length
    ? stats.spent / Math.max(1, txs.filter((t) => t.type === "pay").length)
    : 0;

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink">Mon tableau de bord</h1>
        <p className="text-sm text-muted">
          Où va ton argent, combien tu économises, et chez qui tu dépenses le plus.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solde carte"
          value={card ? fmtDh(card.balanceDh) : "—"}
          sub={card?.code}
          icon={<CreditCard size={17} />}
          accent
        />
        <StatCard
          label="Dépensé"
          value={fmtDh(stats.spent)}
          sub={`${stats.txCount} opérations`}
          icon={<Receipt size={17} />}
        />
        <StatCard
          label="Rechargé"
          value={fmtDh(stats.topped)}
          sub="Depuis le début"
          icon={<ArrowDownLeft size={17} />}
        />
        <StatCard
          label="Cashback gagné"
          value={fmtDh(stats.cashback)}
          sub="Crédité sur la carte"
          icon={<Gift size={17} />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
                Dépenses des 7 derniers jours
              </h3>
              <p className="text-[11px] text-muted">
                Paiement moyen : <span className="money font-bold">{fmtDh(avg)}</span>
              </p>
            </div>
            <Badge tone="teal" icon={<Banknote size={11} />}>
              Carte PAYZIK
            </Badge>
          </div>
          <div className="mt-6 flex h-44 items-end gap-2">
            {days.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="money text-[9.5px] font-bold text-muted">
                  {d.total > 0 ? d.total : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all",
                      d.total > 0
                        ? "bg-gradient-to-t from-teal-deep to-teal"
                        : "bg-surface2",
                    )}
                    style={{
                      height: `${Math.max(4, (d.total / maxDay) * 100)}%`,
                    }}
                    title={`${d.label} · ${fmtDh(d.total)}`}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
            Top commerçants
          </h3>
          {merchants.length === 0 ? (
            <p className="mt-4 rounded-xl bg-surface2 px-3 py-6 text-center text-xs text-muted">
              Aucun paiement enregistré pour l'instant.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {merchants.map(([name, total], i) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface2 text-[10px] font-black text-muted">
                        {i + 1}
                      </span>
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="money shrink-0 font-bold text-ink">{fmtDh(total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal to-teal-glow"
                      style={{ width: `${(total / merchants[0][1]) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
            Dernières opérations
          </h3>
          {txs.length === 0 ? (
            <p className="mt-4 text-xs text-muted">Aucune opération.</p>
          ) : (
            <div className="mt-3 divide-y">
              {txs.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-ink">{t.label}</p>
                    <p className="text-[10.5px] text-muted">
                      {new Date(t.at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "money text-[12px] font-black",
                      t.type === "topup" ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {t.type === "topup" ? "+" : "−"}
                    {fmtDh(t.amountDh)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[13px] font-extrabold tracking-tight text-ink">
            Activité restaurant
          </h3>
          <p className="text-[11px] text-muted">Commandes à table, connectées en direct.</p>
          <div className="mt-4 space-y-2.5">
            {orders.length === 0 && (
              <p className="rounded-xl bg-surface2 px-3 py-6 text-center text-xs text-muted">
                Aucune commande.
              </p>
            )}
            {orders.slice(0, 4).map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border bg-surface2/40 px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy text-[13px] font-black text-orange-glow">
                  {o.tableNo}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-ink">
                    Table {o.tableNo} · {o.customerName ?? "Client"}
                  </p>
                  <p className="text-[10.5px] text-muted">
                    {STATUS_LABEL[o.status]} · {o.paid ? "Payé" : "À encaisser"}
                  </p>
                </div>
                <span className="money text-[12px] font-black text-ink">
                  {fmtDh(o.totalDh)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================
   MODALES
   ================================================================ */

function PayModal({
  target,
  card,
  onClose,
  onConfirm,
  onTopUp,
}: {
  target: Establishment | null;
  card?: WalletCard;
  onClose: () => void;
  onConfirm: (target: Establishment, amount: number) => string | null;
  onTopUp: () => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setAmount("");
      setError("");
    }
  }, [target]);

  if (!target) return null;
  const tone = TONE[target.tone];

  return (
    <Modal open={!!target} onClose={onClose} title="Payer avec PAYZIK">
      <div className="space-y-4">
        <div className={cn("rounded-2xl bg-gradient-to-br p-4 text-white", tone.grad)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
            Paiement chez
          </p>
          <p className="mt-1 text-lg font-black">{target.name}</p>
          <p className="text-[11px] text-white/70">
            {KIND_META[target.kind].label} · {target.district}, {target.city} ·{" "}
            {target.cashbackPct}% cashback
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border bg-surface2 px-3 py-2.5">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-muted">
            <CreditCard size={14} /> {card?.code ?? "Aucune carte"}
          </span>
          <span className="money text-[13px] font-black text-ink">
            {card ? fmtDh(card.balanceDh) : "—"}
          </span>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            Montant à payer
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            {[20, 50, 100, 200].map((v) => (
              <button
                key={v}
                onClick={() => {
                  setAmount(v);
                  setError("");
                }}
                className={cn(
                  "money rounded-xl border px-3.5 py-2 text-sm font-bold transition-all",
                  amount === v
                    ? "border-teal bg-accent-soft text-teal-deep"
                    : "bg-surface text-ink hover:border-teal/40",
                )}
              >
                {v} DH
              </button>
            ))}
          </div>
          <input
            autoFocus
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value ? Number(e.target.value) : "");
              setError("");
            }}
            placeholder="Montant libre"
            className="money h-12 w-full rounded-xl border bg-surface2 px-4 text-lg font-black outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/15">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-accent-soft/50 px-3 py-2 text-[11px] text-teal-deep">
          Cashback estimé :{" "}
          <span className="money font-bold">
            {fmtDh(
              typeof amount === "number"
                ? Math.max(0, Math.round(((amount * target.cashbackPct) / 100) * 100) / 100)
                : 0,
            )}
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            <X size={15} /> Annuler
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            disabled={typeof amount !== "number" || amount <= 0}
            onClick={() => {
              if (typeof amount !== "number") return;
              const err = onConfirm(target, amount);
              if (err) setError(err);
            }}
          >
            <Check size={15} /> Confirmer
          </Button>
        </div>

        {card && typeof amount === "number" && amount > card.balanceDh && (
          <button
            onClick={onTopUp}
            className="w-full rounded-xl border border-dashed border-teal/40 px-3 py-2 text-[12px] font-bold text-teal-deep hover:bg-accent-soft"
          >
            <Plus size={13} className="mr-1 inline" /> Recharger ma carte
          </button>
        )}
      </div>
    </Modal>
  );
}

function MenuModal({
  target,
  menu,
  onClose,
}: {
  target: Establishment | null;
  menu: MenuItem[];
  onClose: () => void;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => setCart({}), [target]);

  if (!target) return null;
  const categories = [...new Set(menu.map((m) => m.category))];
  const total = menu.reduce((s, m) => s + (cart[m.id] ?? 0) * m.priceDh, 0);

  return (
    <Modal open={!!target} onClose={onClose} title={`Menu — ${target.name}`} wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <UtensilsCrossed size={13} /> {target.district}, {target.city}
          </span>
          <span className="flex items-center gap-1 font-bold text-ink">
            <Star size={11} className="fill-amber-400 text-amber-400" />
            {target.rating.toFixed(1)} · {target.reviews} avis
          </span>
        </div>

        {categories.map((cat) => (
          <div key={cat}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              {cat}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {menu
                .filter((m) => m.category === cat)
                .map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-2.5",
                      m.available ? "bg-surface" : "bg-surface2 opacity-60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-ink">{m.name}</p>
                      <p className="truncate text-[10.5px] text-muted">{m.description}</p>
                      <p className="money mt-0.5 text-[12px] font-black text-teal-deep">
                        {fmtDh(m.priceDh)}
                      </p>
                    </div>
                    {m.available && (
                      <div className="flex items-center gap-1">
                        {cart[m.id] ? (
                          <>
                            <button
                              onClick={() =>
                                setCart((c) => ({ ...c, [m.id]: Math.max(0, (c[m.id] ?? 0) - 1) }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted hover:bg-surface2"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="tnum w-4 text-center text-[12px] font-black">
                              {cart[m.id]}
                            </span>
                          </>
                        ) : null}
                        <button
                          onClick={() => setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }))}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange text-night hover:bg-orange-deep"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-surface pt-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total</p>
            <p className="money text-xl font-black text-ink">{fmtDh(total)}</p>
          </div>
          <Button variant="primary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

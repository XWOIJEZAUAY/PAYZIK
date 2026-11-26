/** Espace CLIENT — accueil, carte, commerces et scanner. */
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  MapPin,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Send,
  Star,
  Store,
  Wallet,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DEMO_ADS, DEMO_ESTABLISHMENTS } from "../../data/network";
import { fmtDh } from "../../lib/format";
import type { Profile } from "../../services/auth";
import type { Store as StoreType } from "../../state/store";
import type { Establishment, WalletCard } from "../../types";
import { ClientKridi } from "./client-kridi";
import {
  Avatar,
  Btn,
  cx,
  Empty,
  IconBtn,
  KIND_ICON,
  KIND_LABEL,
  Pane,
  SectionHead,
  Sheet,
  TabBar,
  hoursFor,
} from "./ui";

export type ClientTab = "home" | "card" | "shops" | "kridi";

export const CLIENT_TABS: { id: ClientTab; label: string; icon: typeof Wallet }[] = [
  { id: "home", label: "Accueil", icon: Wallet },
  { id: "card", label: "Ma carte", icon: CreditCard },
  { id: "shops", label: "Commerces", icon: Store },
  { id: "kridi", label: "Kridi", icon: BookOpen },
];

export function ClientSpace({
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
  tab: ClientTab;
  setTab: (t: ClientTab) => void;
  onSwitch: () => void;
  onLogout: () => void;
  notify: (m: string) => void;
}) {
  const card = store.cards[0];
  const [scan, setScan] = useState(false);
  const [payTarget, setPayTarget] = useState<Establishment | null>(null);
  const [p2p, setP2p] = useState(false);
  const name = card?.name ?? user.name ?? "Khadija";

  const pay = (target: Establishment, amount: number): string | null => {
    if (!card) return "Aucune carte PAYZIK sur ce compte.";
    if (amount <= 0) return "Saisis un montant valide.";
    if (amount > card.balanceDh)
      return `Solde insuffisant (${fmtDh(card.balanceDh)}). Recharge ta carte.`;
    const ok = store.payWithCard(card.id, amount, `Paiement ${target.name}`);
    if (!ok) return "Paiement refusé.";
    const cashback = Math.round(((amount * target.cashbackPct) / 100) * 100) / 100;
    if (cashback >= 1) store.topUpCard(card.id, cashback, `Cashback ${target.name}`);
    notify(
      `${fmtDh(amount)} payés chez ${target.name}${
        cashback >= 1 ? ` · +${fmtDh(cashback)} cashback` : ""
      }`,
    );
    return null;
  };

  return (
    <>
      <ClientHeader
        name={name}
        onSwitch={onSwitch}
        onBell={() => notify("3 nouvelles offres près de chez toi")}
      />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {tab === "home" && (
          <ClientHome
            card={card}
            onScan={() => setScan(true)}
            onRecharge={() => setTab("card")}
            onKridi={() => setTab("kridi")}
            onShops={() => setTab("shops")}
            onP2P={() => setP2p(true)}
            onPay={setPayTarget}
          />
        )}
        {tab === "card" && <ClientCard store={store} card={card} notify={notify} />}
        {tab === "shops" && <ClientShops onPay={setPayTarget} notify={notify} />}
        {tab === "kridi" && (
          <ClientKridi
            user={user}
            onSwitch={onSwitch}
            onLogout={onLogout}
            notify={notify}
          />
        )}
      </main>

      <TabBar value={tab} onChange={setTab} items={CLIENT_TABS} />

      <ScanModal
        open={scan}
        onClose={() => setScan(false)}
        onPick={(e) => {
          setScan(false);
          setPayTarget(e);
        }}
      />
      <PayModal
        target={payTarget}
        card={card}
        onClose={() => setPayTarget(null)}
        onConfirm={pay}
      />
      <P2PModal
        open={p2p}
        onClose={() => setP2p(false)}
        card={card}
        onSend={(phone, amount) => {
          const ok = card && store.payWithCard(card.id, amount, `Transfert ${phone}`);
          notify(ok ? `${fmtDh(amount)} envoyés à ${phone}` : "Solde insuffisant");
          setP2p(false);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* En-tête client                                                       */
/* ------------------------------------------------------------------ */

function ClientHeader({
  name,
  onSwitch,
  onBell,
}: {
  name: string;
  onSwitch: () => void;
  onBell: () => void;
}) {
  return (
    <header className="shrink-0 bg-[#F8FAFC] px-4 pb-2 pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium text-[#64748B]">Bonjour,</p>
          <p className="truncate text-[15px] font-bold text-[#0F172A]">{name}</p>
        </div>
        <IconBtn onClick={onBell} label="Notifications">
          <Bell size={17} />
        </IconBtn>
        <IconBtn onClick={onSwitch} label="Changer de profil">
          <ArrowLeftRight size={17} />
        </IconBtn>
      </div>
      <button className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#0F172A] shadow-sm">
        <MapPin size={13} className="text-[#FF5200]" />
        Maârif, Casablanca
        <ChevronDown size={13} className="text-[#64748B]" />
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Accueil                                                              */
/* ------------------------------------------------------------------ */

function ClientHome({
  card,
  onScan,
  onRecharge,
  onKridi,
  onShops,
  onP2P,
  onPay,
}: {
  card?: WalletCard;
  onScan: () => void;
  onRecharge: () => void;
  onKridi: () => void;
  onShops: () => void;
  onP2P: () => void;
  onPay: (e: Establishment) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const nearby = [...DEMO_ESTABLISHMENTS]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);

  return (
    <div className="animate-fade-up space-y-3">
      <Pane className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-medium text-[#64748B]">Solde disponible</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-[32px] font-bold leading-none tracking-tight text-[#0F172A]">
                {hidden ? "•••• DH" : fmtDh(card?.balanceDh ?? 0)}
              </p>
              <button
                onClick={() => setHidden((h) => !h)}
                className="rounded-lg p-1 text-[#94A3B8]"
                aria-label="Masquer le solde"
              >
                {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[#64748B]">
              Carte {card?.code ?? "—"}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF1EA] text-[#FF5200]">
            <Wallet size={18} />
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Btn className="h-11" onClick={onScan}>
            <ScanLine size={17} /> Scanner pour payer
          </Btn>
          <Btn variant="soft" className="h-11" onClick={onRecharge}>
            <Plus size={17} /> Recharger
          </Btn>
        </div>
      </Pane>

      <div className="grid grid-cols-3 gap-2">
        <Quick icon={BookOpen} label="Carnet Kridi" badge={3} onClick={onKridi} />
        <Quick icon={Zap} label="Offres flash" onClick={onShops} />
        <Quick icon={Send} label="Transfert P2P" onClick={onP2P} />
      </div>

      <AdBanner ad={DEMO_ADS[0]} onClick={onShops} />

      <div className="space-y-2">
        <SectionHead title="Offres près de chez toi" action="Tout voir" onAction={onShops} />
        {nearby.map((e) => (
          <ShopRow key={e.id} e={e} onPay={() => onPay(e)} />
        ))}
      </div>
    </div>
  );
}

function Quick({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-[#E2E8F0] bg-white py-3 shadow-sm transition active:scale-[.98]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#0F172A]">
        <Icon size={18} />
      </span>
      <span className="text-[10.5px] font-semibold text-[#0F172A]">{label}</span>
      {badge ? (
        <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5200] px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ShopRow({ e, onPay }: { e: Establishment; onPay: () => void }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#0F172A]">
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#0F172A]">{e.name}</p>
        <p className="flex items-center gap-1 text-[11px] text-[#64748B]">
          <MapPin size={10} /> {e.district} · {e.distanceKm} km
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[10.5px]">
          <span className="flex items-center gap-0.5 font-semibold text-[#0F172A]">
            <Star size={10} className="fill-[#F59E0B] text-[#F59E0B]" />
            {e.rating.toFixed(1)}
          </span>
          <span className="font-semibold text-[#059669]">+{e.cashbackPct}% cashback</span>
        </div>
      </div>
      <button
        onClick={onPay}
        className="shrink-0 rounded-lg bg-[#FF5200] px-3 py-2 text-[11px] font-bold text-white active:scale-95"
      >
        Payer
      </button>
    </div>
  );
}

function AdBanner({ ad, onClick }: { ad: (typeof DEMO_ADS)[number]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-2xl bg-[#0F172A] p-4 text-left text-white shadow-sm active:scale-[.99]"
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#FFB27A]">
        {ad.eyebrow} · sponsorisé
      </p>
      <p className="mt-1 text-[15px] font-bold leading-tight">{ad.title}</p>
      <p className="mt-0.5 text-[11px] text-white/60">{ad.subtitle}</p>
      <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#FF5200] px-2.5 py-1 text-[10.5px] font-bold">
        {ad.cta} <ArrowRight size={11} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ma carte & recharge                                                  */
/* ------------------------------------------------------------------ */

type PayMethod = "cmi" | "virement" | "especes";

function ClientCard({
  store,
  card,
  notify,
}: {
  store: StoreType;
  card?: WalletCard;
  notify: (m: string) => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<PayMethod>("cmi");
  const [pending, setPending] = useState<{ id: number; amount: number }[]>([]);
  const txs = card ? store.cardTxFor(card.id) : [];
  const cashback = txs
    .filter((t) => t.label.startsWith("Cashback"))
    .reduce((s, t) => s + t.amountDh, 0);

  const recharge = () => {
    if (!card || typeof amount !== "number" || amount <= 0) return;
    if (method === "especes") {
      setPending((p) => [{ id: Date.now(), amount }, ...p]);
      notify(`Demande de ${fmtDh(amount)} envoyée au commerçant`);
    } else {
      store.topUpCard(
        card.id,
        amount,
        method === "cmi" ? "Recharge CMI" : "Recharge virement",
      );
      notify(`${fmtDh(amount)} rechargés sur ta carte`);
    }
    setAmount("");
  };

  const methods: { id: PayMethod; label: string }[] = [
    { id: "cmi", label: "Carte CMI" },
    { id: "virement", label: "Virement" },
    { id: "especes", label: "Espèces au Hanout" },
  ];

  return (
    <div className="animate-fade-up space-y-3">
      {/* carte virtuelle */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#7C2D12] p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FF5200]/30 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
              PAYZIK
            </p>
            <p className="mt-0.5 text-[11px] text-white/50">Carte prépayée</p>
          </div>
          <Wifi size={20} className="rotate-90 text-white/70" />
        </div>
        <div className="relative mt-5 flex items-center gap-2">
          <span className="h-7 w-9 rounded-md bg-gradient-to-br from-[#F5B942] to-[#D98700] ring-1 ring-white/20" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            NFC
          </span>
        </div>
        <p className="relative mt-3 font-mono text-[16px] tracking-[0.18em]">
          {card?.code ?? "PZK-XXXX-XX"}
        </p>
        <div className="relative mt-4 flex items-end justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/40">Titulaire</p>
            <p className="text-[13px] font-semibold">{card?.name ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Solde</p>
            <p className="font-mono text-[18px] font-bold">{fmtDh(card?.balanceDh ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* recharge */}
      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#0F172A]">Recharger ma carte</h3>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={cx(
                "rounded-lg border py-2 font-mono text-[12px] font-bold transition",
                amount === v
                  ? "border-[#FF5200] bg-[#FFF1EA] text-[#FF5200]"
                  : "border-[#E2E8F0] text-[#0F172A]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
          placeholder="Autre montant"
          className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] outline-none focus:border-[#FF5200]"
        />
        <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#059669]">
          <Gift size={13} />
          +{Math.round((typeof amount === "number" ? amount : 0) * 0.02)} DH de cashback offert
        </p>

        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
          Moyen de paiement
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={cx(
                "rounded-lg border px-1 py-2 text-[10px] font-semibold transition",
                method === m.id
                  ? "border-[#0F172A] bg-[#0F172A] text-white"
                  : "border-[#E2E8F0] text-[#64748B]",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Btn
          className="mt-3 w-full"
          disabled={typeof amount !== "number" || amount <= 0}
          onClick={recharge}
        >
          <Plus size={16} />
          Recharger {typeof amount === "number" ? fmtDh(amount) : ""}
        </Btn>

        {pending.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl bg-[#FFFBEB] p-2.5">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-[#B45309]">
                  <Clock size={12} /> En attente du commerçant
                </span>
                <span className="font-mono font-bold text-[#B45309]">{fmtDh(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Pane>

      {/* historique */}
      <Pane className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[#0F172A]">Historique</h3>
          <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
            {txs.length} opérations
          </span>
        </div>
        {txs.length === 0 ? (
          <Empty
            icon={<CreditCard size={22} />}
            title="Aucune opération"
            hint="Recharge ta carte ou paie chez un partenaire."
          />
        ) : (
          <div className="mt-2 divide-y divide-[#F1F5F9]">
            {txs.slice(0, 8).map((t) => {
              const up = t.type === "topup";
              return (
                <div key={t.id} className="flex items-center gap-2.5 py-2">
                  <span
                    className={cx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      up ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEF2F2] text-[#DC2626]",
                    )}
                  >
                    {up ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#0F172A]">
                      {t.label}
                    </p>
                    <p className="text-[10px] text-[#64748B]">
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
                      up ? "text-[#059669]" : "text-[#DC2626]",
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
        <p className="mt-2 flex items-center justify-between text-[11px] text-[#64748B]">
          <span>Cashback cumulé</span>
          <span className="font-mono font-bold text-[#059669]">{fmtDh(cashback)}</span>
        </p>
      </Pane>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Commerces & offres                                                   */
/* ------------------------------------------------------------------ */

type ShopFilter = "all" | "hanout" | "cafe" | "boucherie" | "pharmacie" | "patisserie";

const SHOP_FILTERS: { id: ShopFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "hanout", label: "Hanouts" },
  { id: "cafe", label: "Cafés" },
  { id: "boucherie", label: "Boucheries" },
  { id: "pharmacie", label: "Pharmacies" },
  { id: "patisserie", label: "Pâtisseries" },
];

function ClientShops({
  onPay,
  notify,
}: {
  onPay: (e: Establishment) => void;
  notify: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ShopFilter>("all");

  const list = DEMO_ESTABLISHMENTS.filter((e) => {
    const okFilter =
      filter === "all"
        ? true
        : filter === "boucherie"
          ? e.tags.some((t) => /boucher|viande|grillade/i.test(t))
          : e.kind === filter;
    const okQ =
      !q.trim() ||
      e.name.toLowerCase().includes(q.toLowerCase()) ||
      e.district.toLowerCase().includes(q.toLowerCase()) ||
      e.city.toLowerCase().includes(q.toLowerCase());
    return okFilter && okQ;
  });

  return (
    <div className="animate-fade-up space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un commerce…"
          className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 text-[13px] text-[#0F172A] shadow-sm outline-none placeholder:text-[#94A3B8] focus:border-[#FF5200]"
        />
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SHOP_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition",
              filter === f.id
                ? "border-transparent bg-[#FF5200] text-white"
                : "border-[#E2E8F0] bg-white text-[#64748B]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <AdBanner ad={DEMO_ADS[3]} onClick={() => notify("Offre ajoutée à ton carnet")} />

      <div className="space-y-2">
        {list.map((e) => (
          <ShopCard key={e.id} e={e} onPay={() => onPay(e)} />
        ))}
      </div>

      {list.length === 0 && (
        <Empty
          icon={<Search size={22} />}
          title="Aucun commerce trouvé"
          hint="Essaie un autre nom ou un autre filtre."
        />
      )}
    </div>
  );
}

function ShopCard({ e, onPay }: { e: Establishment; onPay: () => void }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-start gap-3 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-[#0F172A]">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold text-[#0F172A]">{e.name}</p>
              <p className="flex items-center gap-1 text-[11px] text-[#64748B]">
                <MapPin size={10} /> {e.district}, {e.city} · {e.distanceKm} km
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-[#0F172A]">
              <Star size={11} className="fill-[#F59E0B] text-[#F59E0B]" />
              {e.rating.toFixed(1)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-[#ECFDF5] px-1.5 py-0.5 text-[9.5px] font-bold text-[#059669]">
              +{e.cashbackPct}% cashback
            </span>
            <span className="rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#64748B]">
              {KIND_LABEL[e.kind]}
            </span>
            <span className="text-[9.5px] text-[#94A3B8]">{e.reviews} avis</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#F1F5F9] px-3 py-2">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-[#059669]">
          <Clock size={11} /> {hoursFor(e)}
        </span>
        <button
          onClick={onPay}
          className="rounded-lg bg-[#FF5200] px-3 py-1.5 text-[11px] font-bold text-white active:scale-95"
        >
          Payer en caisse
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modales                                                              */
/* ------------------------------------------------------------------ */

function ScanModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (e: Establishment) => void;
}) {
  const [left, setLeft] = useState(60);

  useEffect(() => {
    if (!open) return;
    setLeft(60);
    const iv = window.setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          window.clearInterval(iv);
          onClose();
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#0F172A]">Scanner pour payer</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-[#64748B]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[240px] overflow-hidden rounded-2xl bg-[#0F172A]">
          <span className="absolute left-3 top-3 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-[#FF5200]" />
          <span className="absolute right-3 top-3 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-[#FF5200]" />
          <span className="absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-[#FF5200]" />
          <span className="absolute bottom-3 right-3 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-[#FF5200]" />
          <div className="absolute inset-x-8 top-1/2 h-0.5 animate-scan-line bg-[#FF5200]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <QrCode size={64} className="text-white/15" />
          </div>
        </div>

        <p className="mt-3 text-center text-[12px] text-[#64748B]">
          Présentez le QR du commerçant · {left}s
        </p>
        <p className="mt-2 text-center text-[11px] font-semibold text-[#0F172A]">
          Ou choisissez un commerçant
        </p>
        <div className="mt-2 max-h-[170px] space-y-1.5 overflow-y-auto">
          {DEMO_ESTABLISHMENTS.slice(0, 5).map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <button
                key={e.id}
                onClick={() => {
                  onClose();
                  onPick(e);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[#E2E8F0] p-2 text-left active:bg-[#F8FAFC]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#0F172A]">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#0F172A]">
                  {e.name}
                </span>
                <ChevronRight size={14} className="text-[#94A3B8]" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PayModal({
  target,
  card,
  onClose,
  onConfirm,
}: {
  target: Establishment | null;
  card?: WalletCard;
  onClose: () => void;
  onConfirm: (target: Establishment, amount: number) => string | null;
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

  const submit = () => {
    const err = onConfirm(target, typeof amount === "number" ? amount : 0);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Payer avec PAYZIK">
      <div className="rounded-xl bg-[#0F172A] p-3 text-white">
        <p className="text-[10px] uppercase tracking-wider text-white/50">Paiement chez</p>
        <p className="text-[15px] font-bold">{target.name}</p>
        <p className="text-[11px] text-white/60">
          {KIND_LABEL[target.kind]} · {target.district} · +{target.cashbackPct}% cashback
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-[#E2E8F0] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#64748B]">
          <CreditCard size={14} /> {card?.code ?? "Aucune carte"}
        </span>
        <span className="font-mono text-[12px] font-bold text-[#0F172A]">
          {fmtDh(card?.balanceDh ?? 0)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[20, 50, 100, 200].map((v) => (
          <button
            key={v}
            onClick={() => {
              setAmount(v);
              setError("");
            }}
            className={cx(
              "rounded-lg border py-2 font-mono text-[12px] font-bold transition",
              amount === v
                ? "border-[#FF5200] bg-[#FFF1EA] text-[#FF5200]"
                : "border-[#E2E8F0] text-[#0F172A]",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <input
        inputMode="numeric"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value ? Number(e.target.value) : "");
          setError("");
        }}
        placeholder="Autre montant"
        className="mt-2 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 font-mono text-[13px] outline-none focus:border-[#FF5200]"
      />

      {error && <p className="mt-2 text-[11px] font-semibold text-[#DC2626]">{error}</p>}

      <Btn
        className="mt-3 w-full"
        onClick={submit}
        disabled={typeof amount !== "number" || amount <= 0}
      >
        <Check size={16} /> Payer {typeof amount === "number" ? fmtDh(amount) : ""}
      </Btn>
    </Sheet>
  );
}

function P2PModal({
  open,
  onClose,
  card,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  card?: WalletCard;
  onSend: (phone: string, amount: number) => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setPhone("");
    }
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Transfert P2P">
      <p className="text-[11.5px] text-[#64748B]">
        Envoie de l'argent à un proche sur son numéro.
      </p>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="06 XX XX XX XX"
        className="mt-3 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[13px] outline-none focus:border-[#FF5200]"
      />
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[20, 50, 100, 200].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className={cx(
              "rounded-lg border py-2 font-mono text-[12px] font-bold transition",
              amount === v
                ? "border-[#FF5200] bg-[#FFF1EA] text-[#FF5200]"
                : "border-[#E2E8F0] text-[#0F172A]",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <Btn
        className="mt-3 w-full"
        disabled={!phone.trim() || typeof amount !== "number" || amount <= 0}
        onClick={() => onSend(phone.trim(), amount as number)}
      >
        <Send size={15} /> Envoyer {typeof amount === "number" ? fmtDh(amount) : ""}
      </Btn>
      <p className="mt-2 text-[10.5px] text-[#64748B]">
        Solde disponible : {fmtDh(card?.balanceDh ?? 0)}
      </p>
    </Sheet>
  );
}

/** Espace CLIENT — accueil, carte, commerces et scanner. */
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  Heart,
  MapPin,
  QrCode,
  ReceiptText,
  ScanLine,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { listShops, type PayzikCard } from "../../services/backend/payzikCards";
import { listClientOrders, requestCardPayment, type PrepOrder } from "../../services/backend/payzikOrders";
import { useClientSpending, type SpendingSummary } from "../../services/backend/payzikSpending";
import { listActiveOffers, type ShopOffer } from "../../services/backend/payzikOffers";
import { listPartnerAds, type PartnerAd } from "../../services/backend/payzikPartnerAds";
import type { Ad } from "../../types";
import { fmtDh } from "../../lib/format";
import type { Profile } from "../../services/auth";
import type { Establishment } from "../../types";
import { CloudRechargePanel } from "../customer/CloudRechargePanel";
import { ClientCatalog } from "./ClientCatalog";
import { ClientCardSheet } from "./ClientCardSheet";
import { ClientAgentModal } from "./ClientAgentModal";
import { PartnerAdBanner } from "./PartnerAdBanner";
import { GoogleAdBanner } from "./GoogleAdBanner";
import { useClientCard } from "./useClientCard";
import {
  Avatar,
  Btn,
  cx,
  Empty,
  KIND_ICON,
  Pane,
  SectionHead,
  Sheet,
  TabBar,
} from "./ui";

export type ClientTab = "home" | "card" | "shops" | "catalog" | "profil";

export const CLIENT_TABS: { id: ClientTab; label: string; icon: typeof Wallet }[] = [
  { id: "home", label: "Accueil", icon: Wallet },
  { id: "card", label: "Carte", icon: CreditCard },
  { id: "shops", label: "Boutiques", icon: Store },
  { id: "profil", label: "Profil", icon: UserRound },
];

type RealNetwork = {
  shops: Establishment[];
  offers: ShopOffer[];
  ads: Ad[];
  partnerAds: PartnerAd[];
};

/** Récupère les vraies boutiques et offres Supabase (aucune simulation). */
function useRealNetwork(): RealNetwork {
  const [shops, setShops] = useState<Establishment[]>([]);
  const [offers, setOffers] = useState<ShopOffer[]>([]);
  const [partnerAds, setPartnerAds] = useState<PartnerAd[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, o, p] = await Promise.all([
        listShops(),
        listActiveOffers(),
        listPartnerAds("home"),
      ]);
      if (!alive) return;
      const offerByShop = new Map<string, ShopOffer>();
      if (o.ok) o.data.forEach((x) => { if (!offerByShop.has(x.shop_id)) offerByShop.set(x.shop_id, x); });
      if (s.ok) {
        setShops(s.data.map((x) => {
          const offer = offerByShop.get(x.id);
          return {
            id: x.id,
            name: x.shop_name,
            kind: "hanout" as const,
            city: x.city ?? "",
            district: x.address ?? "",
            image: x.image ?? null,
            rating: 0,
            reviews: 0,
            tags: [],
            cashbackPct: 0,
            distanceKm: 0,
            promo: offer?.discount_label ?? offer?.title,
            tone: "amber" as const,
          };
        }));
      }
      if (o.ok) setOffers(o.data);
      if (p.ok) setPartnerAds(p.data);
    })();
    return () => { alive = false; };
  }, []);

  const ads: Ad[] = offers.slice(0, 4).map((o) => ({
    id: o.id,
    eyebrow: "OFFRE PAYZIK",
    title: o.discount_label || o.title,
    subtitle: o.shop?.shop_name || "Boutique partenaire",
    cta: "Voir l'offre",
    sponsor: o.shop?.shop_name || "PAYZIK",
    tone: "amber" as const,
  }));

  return { shops, offers, ads, partnerAds };
}

export function ClientSpace({
  user,
  tab,
  setTab,
  onProfile,
  notify,
}: {
  user: Profile;
  tab: ClientTab;
  setTab: (t: ClientTab) => void;
  onProfile: () => void;
  notify: (m: string) => void;
}) {
  const { card, refresh: refreshCard } = useClientCard(user.id, user.name ?? "Client");
  const { summary: spending, refresh: refreshSpending } = useClientSpending();
  const [scan, setScan] = useState(false);
  const [payTarget, setPayTarget] = useState<Establishment | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [catalogShopId, setCatalogShopId] = useState("");
  const [hiddenPartnerAd, setHiddenPartnerAd] = useState("");
  const [agentOpen, setAgentOpen] = useState(false);
  const name = user.name ?? card?.name ?? "Client";
  const network = useRealNetwork();

  const pay = async (target: Establishment, amount: number): Promise<string | null> => {
    if (!card) return "Aucune carte PAYZIK sur ce compte.";
    if (amount <= 0) return "Montant invalide.";
    if (amount > card.balance_dh)
      return `Solde insuffisant (${fmtDh(card.balance_dh)}). Recharge ta carte.`;
    const res = await requestCardPayment(target.id, amount, card.id);
    if (!res.ok) return `Envoi impossible : ${res.error}`;
    notify(`${fmtDh(amount)} envoyés à ${target.name}.`);
    await refreshCard();
    await refreshSpending();
    return null;
  };

  const openCatalog = (shopId: string) => {
    setCatalogShopId(shopId);
    setTab("catalog");
  };

  return (
    <>
      <ClientHeader
        name={name}
        offersCount={network.offers.length}
        onProfile={onProfile}
        onBell={() => setHistoryOpen(true)}
        image={user.image ?? null}
      />
      <main className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {tab === "home" && (
          <ClientHome
            card={card}
            onScan={() => setScan(true)}
            onRecharge={() => setTab("card")}
            onCard={() => setTab("card")}
            onShops={() => setTab("shops")}
            onQr={() => setQrOpen(true)}
            onHistory={() => setHistoryOpen(true)}
            onPay={setPayTarget}
            onAgent={() => setAgentOpen(true)}
            spending={spending}
            shops={network.shops}
            ads={network.ads}
            partnerAds={network.partnerAds}
            hiddenPartnerAd={hiddenPartnerAd}
            onHidePartnerAd={setHiddenPartnerAd}
          />
        )}
        {tab === "card" && (
          <ClientCard
            card={card}
            name={name}
            notify={notify}
            onRefresh={refreshCard}
            onQr={() => setQrOpen(true)}
            onHistory={() => setHistoryOpen(true)}
            spending={spending}
          />
        )}
        {tab === "shops" && (
          <ClientShops
            onPay={setPayTarget}
            onCatalog={openCatalog}
            notify={notify}
            shops={network.shops}
            ads={network.ads}
          />
        )}
        {tab === "catalog" && (
          <ClientCatalog user={user} notify={notify} initialShopId={catalogShopId} />
        )}
      </main>

      <TabBar
        value={tab}
        onChange={(t) => (t === "profil" ? onProfile() : setTab(t))}
        items={CLIENT_TABS}
        columns={4}
      />

      <ClientCardSheet
        open={qrOpen}
        card={card}
        name={name}
        onClose={() => setQrOpen(false)}
        onRecharge={() => setTab("card")}
      />

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        spending={spending}
        shops={network.shops}
      />

      <ScanModal
        open={scan}
        onClose={() => setScan(false)}
        onPick={(e) => {
          setScan(false);
          setPayTarget(e);
        }}
        shops={network.shops}
      />
      <PayModal
        target={payTarget}
        card={card}
        onClose={() => setPayTarget(null)}
        onConfirm={pay}
        onShowQr={() => {
          setPayTarget(null);
          setQrOpen(true);
        }}
      />
      <ClientAgentModal
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        name={name}
        card={card}
        spending={spending}
        shops={network.shops}
        onRecharge={() => setTab("card")}
        onHistory={() => setHistoryOpen(true)}
        onPay={() => setTab("shops")}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* En-tête client                                                       */
/* ------------------------------------------------------------------ */

function ClientHeader({
  name,
  offersCount,
  onProfile,
  onBell,
  image,
}: {
  name: string;
  offersCount: number;
  onProfile: () => void;
  onBell: () => void;
  image?: string | null;
}) {
  const first = name.trim().split(/\s+/)[0] || "Client";
  return (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#E91E83] via-[#D41874] to-[#8136A8] px-4 pb-8 pt-[calc(env(safe-area-inset-top)+14px)] text-white">
      <span className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -bottom-20 left-10 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">PAYZIK</p>
          <p className="mt-0.5 truncate text-[17px] font-bold leading-tight">Bonjour, {first} 👋</p>
          <p className="text-[10.5px] text-white/70">Votre vie, vos paiements</p>
        </div>
        <button
          onClick={onBell}
          aria-label="Notifications et activités"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur active:scale-95"
        >
          <Bell size={18} />
          {offersCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#FCEAF4] ring-2 ring-[#E91E83]" />
          )}
        </button>
        <button onClick={onProfile} aria-label="Mon profil" className="rounded-full ring-2 ring-white/60 active:scale-95">
          <Avatar name={name} image={image} size={38} />
        </button>
      </div>
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
  onCard,
  onShops,
  onQr,
  onHistory,
  onPay,
  onAgent,
  spending,
  shops,
  ads,
  partnerAds,
  hiddenPartnerAd,
  onHidePartnerAd,
}: {
  card: PayzikCard | null;
  onScan: () => void;
  onRecharge: () => void;
  onCard: () => void;
  onShops: () => void;
  onQr: () => void;
  onHistory: () => void;
  onPay: (e: Establishment) => void;
  onAgent: () => void;
  spending: SpendingSummary;
  shops: Establishment[];
  ads: Ad[];
  partnerAds: PartnerAd[];
  hiddenPartnerAd: string;
  onHidePartnerAd: (id: string) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const nearby = shops.slice(0, 3);
  const loyalty = shops.filter((s) => s.promo).slice(0, 6);
  const partnerAd = partnerAds.find((a) => a.id !== hiddenPartnerAd);

  return (
    <div className="animate-fade-up -mt-6 space-y-4 pb-2">
      {/* Carte portefeuille — élément principal de l'accueil */}
      <section className="rounded-[24px] bg-white p-4 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#81748A]">
              Mon portefeuille PAYZIK
            </p>
            <button onClick={onQr} className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#E91E83]">
              {card?.code ?? "Carte PAYZIK"} <ChevronRight size={12} />
            </button>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E91E83] to-[#8136A8] text-white shadow-sm">
            <Wallet size={19} />
          </span>
        </div>

        <div className="mt-2 flex items-end gap-2">
          <p className="font-mono text-[30px] font-extrabold leading-none tracking-tight text-[#21152C]">
            {hidden ? "•••• DH" : fmtDh(card?.balance_dh ?? 0)}
          </p>
          <button
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Afficher le solde" : "Masquer le solde"}
            className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#F1E5FA] text-[#8136A8] active:scale-95"
          >
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="mt-1 text-[10.5px] text-[#81748A]">Solde disponible sur votre carte</p>

        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#FCEAF4] to-[#F1E5FA] p-3">
          <button
            onClick={onCard}
            className="relative aspect-[1.6/1] w-[112px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#51206F] via-[#8136A8] to-[#E91E83] p-2 text-left text-white shadow-sm active:scale-[.98]"
            aria-label="Voir ma carte digitale"
          >
            <span className="text-[7px] font-black tracking-[0.2em] text-white/80">PAYZIK</span>
            <CreditCard size={14} className="mt-1.5 text-white/90" />
            <span className="absolute bottom-2 left-2 truncate font-mono text-[8px] text-white/80">
              {card?.code ?? "—"}
            </span>
          </button>
          <button
            onClick={onQr}
            className="hidden shrink-0 active:scale-95 min-[360px]:block"
            aria-label="Afficher mon QR"
          >
            <MiniQr code={card?.code ?? ""} />
          </button>
          <div className="min-w-0 flex-1">
            <Btn variant="soft" className="w-full !text-[11px]" onClick={onQr}>
              <QrCode size={14} /> Voir mon QR
            </Btn>
            <p className="mt-1 truncate text-[9.5px] leading-tight text-[#81748A]">
              Présentez-le en caisse
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E9DDF2] pt-3">
          <button onClick={onHistory} className="text-left">
            <p className="text-[10px] text-[#81748A]">Dépensé ce mois</p>
            <p className="font-mono text-[13px] font-bold text-[#21152C]">{fmtDh(spending.spentMonth)}</p>
          </button>
          <button onClick={onCard} className="text-left">
            <p className="text-[10px] text-[#81748A]">Rechargé</p>
            <p className="font-mono text-[13px] font-bold text-[#8136A8]">{fmtDh(spending.toppedAll)}</p>
          </button>
        </div>
      </section>

      {/* Trois actions rapides */}
      <section className="grid grid-cols-3 gap-2">
        <Quick icon={ScanLine} label="Payer" onClick={onScan} />
        <Quick icon={ArrowDownToLine} label="Recevoir" onClick={onQr} />
        <Quick icon={Store} label="Boutiques" onClick={onShops} />
      </section>

      {/* Cartes de fidélité réelles */}
      <section className="space-y-2">
        <SectionHead title="Mes cartes de fidélité" action="Voir tout" onAction={onShops} />
        {loyalty.length > 0 ? (
          <div className="scrollbar-thin -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {loyalty.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onPay(s)}
                className={`animate-fade-up relative h-[92px] w-[150px] shrink-0 overflow-hidden rounded-2xl p-3 text-left text-white shadow-sm active:scale-[.98] ${
                  i % 3 === 0
                    ? "bg-gradient-to-br from-[#E91E83] to-[#F43F9E]"
                    : i % 3 === 1
                      ? "bg-gradient-to-br from-[#51206F] to-[#8136A8]"
                      : "bg-gradient-to-br from-[#8136A8] to-[#E91E83]"
                }`}
                style={{ animationDelay: `${i * 45}ms`, animationFillMode: "both" }}
              >
                <Heart size={15} className="text-white/80" />
                <p className="mt-2 truncate text-[12px] font-bold">{s.name}</p>
                <p className="truncate text-[9.5px] text-white/80">{s.promo}</p>
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={onShops}
            className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-[#E9DDF2] bg-white px-3 py-3 text-left text-[11px] text-[#81748A]"
          >
            <Gift size={16} className="text-[#E91E83]" />
            Les cartes de fidélité des boutiques du réseau apparaîtront ici.
          </button>
        )}
      </section>

      {/* Promotion */}
      <button
        onClick={onShops}
        className="flex w-full items-center gap-3 rounded-[22px] bg-gradient-to-br from-[#FCEAF4] to-[#F1E5FA] p-4 text-left active:scale-[.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#E91E83] shadow-sm">
          <ShoppingBag size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-[#21152C]">Découvrez nos offres spéciales !</span>
          <span className="mt-0.5 block text-[10.5px] text-[#81748A]">Les promotions des boutiques partenaires</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E91E83] px-3 py-2 text-[10px] font-bold text-white">
          Voir les offres <ArrowRight size={11} />
        </span>
      </button>

      {ads[0] && <AdBanner ad={ads[0]} onClick={onShops} />}
      {partnerAd && (
        <PartnerAdBanner ad={partnerAd} onHide={() => onHidePartnerAd(partnerAd.id)} />
      )}
      <GoogleAdBanner />

      {/* Dernières activités */}
      <section className="space-y-2">
        <SectionHead title="Dernières activités" action="Voir tout" onAction={onHistory} />
        {spending.recent.length > 0 ? (
          <div className="space-y-1.5">
            {spending.recent.slice(0, 3).map((t) => (
              <TransactionRow key={t.id} tx={t} shops={shops} />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 text-[11px] text-[#81748A] shadow-sm">
            <ReceiptText size={16} className="text-[#8136A8]" />
            Aucune activité pour le moment.
          </div>
        )}
      </section>

      {/* Boutiques */}
      <section className="space-y-2">
        <SectionHead title="Boutiques" action="Tout voir" onAction={onShops} />
        {nearby.map((e) => (
          <ShopRow key={e.id} e={e} onPay={() => onPay(e)} />
        ))}
      </section>

      <button
        onClick={onRecharge}
        className="w-full rounded-2xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#8136A8] active:scale-[.99]"
      >
        Recharger ma carte
      </button>
      <button
        onClick={onAgent}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#E9DDF2] bg-white py-2.5 text-[11px] font-bold text-[#8136A8] active:scale-[.99]"
      >
        <Sparkles size={14} /> Agent IA — vocal et écrit
      </button>
    </div>
  );
}

/** QR personnel réel, généré depuis le code de la carte (jamais une image statique). */
function MiniQr({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!code) return;
    QRCode.toDataURL(code, {
      margin: 0,
      width: 96,
      color: { dark: "#51206F", light: "#FFFFFF" },
    })
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(""); });
    return () => { alive = false; };
  }, [code]);
  return (
    <span className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-xl border border-[#E9DDF2] bg-white">
      {url ? (
        <img src={url} alt="QR de votre carte PAYZIK" className="h-full w-full object-contain" />
      ) : (
        <QrCode size={26} className="text-[#A08BAE]" />
      )}
    </span>
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
      className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-[#E9DDF2] bg-white py-3 shadow-sm transition active:scale-[.98]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#E91E83] to-[#F43F9E] text-white shadow-sm">
        <Icon size={17} />
      </span>
      <span className="text-[10.5px] font-bold text-[#21152C]">{label}</span>
      {badge ? (
        <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E91E83] px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ShopRow({ e, onPay }: { e: Establishment; onPay: () => void }) {
  const Icon = KIND_ICON[e.kind];
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[#E9DDF2] bg-white p-2.5 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1E5FA] text-[#E91E83]">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-bold text-[#21152C]">{e.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-[#81748A]">
          <MapPin size={10} /> {e.district}
        </p>
      </div>
      <button
        onClick={onPay}
        className="shrink-0 rounded-lg bg-[#E91E83] px-3 py-2 text-[11px] font-bold text-white active:scale-95"
      >
        Payer
      </button>
    </div>
  );
}

function AdBanner({ ad, onClick }: { ad: Ad; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#8136A8] via-[#E91E83] to-[#21152C] p-3 text-left text-white shadow-sm active:scale-[.99]"
    >
      <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/75">{ad.eyebrow}</p>
      <p className="mt-0.5 text-[13px] font-bold leading-tight">{ad.title}</p>
      <p className="text-[10px] text-white/65">{ad.subtitle}</p>
      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[9.5px] font-bold">
        {ad.cta} <ArrowRight size={11} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ma carte & recharge                                                  */
/* ------------------------------------------------------------------ */

function ClientCard({
  card,
  name,
  notify,
  onRefresh,
  onQr,
  onHistory,
  spending,
}: {
  card: PayzikCard | null;
  name: string;
  notify: (m: string) => void;
  onRefresh: () => Promise<unknown> | void;
  onQr: () => void;
  onHistory: () => void;
  spending: SpendingSummary;
}) {
  return (
    <div className="animate-fade-up space-y-2.5">
      <div className="rounded-2xl bg-gradient-to-br from-[#E91E83] to-[#C9A3E0] p-4 text-white shadow-md">
        <div className="flex items-start justify-between">
          <CreditCard size={20} className="text-white/90" />
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/85">
            PAYZIK
          </span>
        </div>
        <p className="mt-3 truncate text-[14px] font-bold">{name}</p>
        <p className="font-mono text-[10.5px] text-white/60">{card?.code ?? "—"}</p>
        <div className="mt-3 flex items-end justify-between border-t border-white/15 pt-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/60">Solde</p>
            <p className="font-mono text-[18px] font-bold">{fmtDh(card?.balance_dh ?? 0)}</p>
          </div>
          <p className="text-[10px] text-white/70">Une seule carte</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onQr}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E91E83] bg-[#F1E5FA] text-[11px] font-bold text-[#E91E83]"
        >
          <QrCode size={14} /> Afficher mon QR
        </button>
        <button
          onClick={onHistory}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E9DDF2] bg-white text-[11px] font-bold text-[#8136A8]"
        >
          <ReceiptText size={14} /> Mes transactions
        </button>
      </div>

      <Pane className="p-3.5">
        <h2 className="text-[12px] font-bold text-[#21152C]">Portefeuille</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#FDF9FE] p-2 text-center">
            <p className="text-[9px] text-[#81748A]">Solde</p>
            <p className="font-mono text-[12px] font-bold text-[#21152C]">
              {fmtDh(card?.balance_dh ?? 0)}
            </p>
          </div>
          <div className="rounded-xl bg-[#F1E5FA] p-2 text-center">
            <p className="text-[9px] text-[#E91E83]">Dépensé</p>
            <p className="font-mono text-[12px] font-bold text-[#E91E83]">
              {fmtDh(spending.spentMonth)}
            </p>
          </div>
          <div className="rounded-xl bg-[#FDF9FE] p-2 text-center">
            <p className="text-[9px] text-[#81748A]">Rechargé</p>
            <p className="font-mono text-[12px] font-bold text-[#21152C]">
              {fmtDh(spending.toppedAll)}
            </p>
          </div>
        </div>
        {spending.recent.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-[#F7F1FB] pt-2">
            {spending.recent.slice(0, 3).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[10.5px]">
                <span className="truncate text-[#81748A]">
                  {t.description || "Paiement"} · {new Date(t.createdAt).toLocaleDateString("fr-MA")}
                </span>
                <span className="font-mono font-bold text-[#21152C]">-{fmtDh(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Pane>

      <CloudRechargePanel card={card} onNotice={notify} onRefresh={onRefresh} />
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
  onCatalog,
  notify,
  shops,
  ads,
}: {
  onPay: (e: Establishment) => void;
  onCatalog: (shopId: string) => void;
  notify: (m: string) => void;
  shops: Establishment[];
  ads: Ad[];
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ShopFilter>("all");

  const list = shops.filter((e) => {
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
      <div className="pt-1">
        <h1 className="text-[20px] font-extrabold leading-tight text-[#21152C]">Boutiques</h1>
        <p className="text-[10.5px] text-[#81748A]">Découvrez les commerces du réseau PAYZIK</p>
      </div>
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A08BAE]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un commerce…"
          className="h-11 w-full rounded-xl border border-[#E9DDF2] bg-white pl-9 pr-3 text-[13px] text-[#21152C] shadow-sm outline-none placeholder:text-[#A08BAE] focus:border-[#E91E83]"
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
                ? "border-transparent bg-[#E91E83] text-white"
                : "border-[#E9DDF2] bg-white text-[#81748A]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {ads[0] && <AdBanner ad={ads[0]} onClick={() => notify("Offre ajoutée à ton carnet")} />}

      <div className="grid grid-cols-2 gap-2.5">
        {list.map((e, i) => (
          <ShopCard
            key={e.id}
            e={e}
            index={i}
            onPay={() => onPay(e)}
            onCatalog={() => onCatalog(e.id)}
          />
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

function ShopCard({
  e,
  index,
  onPay,
  onCatalog,
}: {
  e: Establishment;
  index: number;
  onPay: () => void;
  onCatalog: () => void;
}) {
  const Icon = KIND_ICON[e.kind];
  return (
    <div
      className="animate-fade-up overflow-hidden rounded-[20px] bg-white shadow-sm"
      style={{ animationDelay: `${Math.min(index, 14) * 45}ms`, animationFillMode: "both" }}
    >
      <button
        onClick={onCatalog}
        aria-label={`Voir ${e.name}`}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-[#FCEAF4] to-[#F1E5FA]"
      >
        {e.image ? (
          <img src={e.image} alt={e.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#8136A8]">
            <Icon size={42} strokeWidth={1.4} />
          </span>
        )}
        {e.promo && (
          <span className="absolute left-2 top-2 max-w-[80%] truncate rounded-full bg-[#E91E83] px-2 py-1 text-[8.5px] font-bold text-white shadow-sm">
            {e.promo}
          </span>
        )}
      </button>
      <div className="p-2.5">
        <p className="truncate text-[12px] font-bold text-[#21152C]">{e.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[9.5px] text-[#81748A]">
          <MapPin size={10} className="shrink-0" />
          <span className="truncate">{[e.district, e.city].filter(Boolean).join(", ") || "Localisation non renseignée"}</span>
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={onCatalog}
            className="flex-1 rounded-xl border border-[#E9DDF2] py-1.5 text-[10px] font-bold text-[#8136A8] active:scale-95"
          >
            Voir
          </button>
          <button
            onClick={onPay}
            aria-label={`Payer chez ${e.name}`}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#E91E83] to-[#F43F9E] text-white shadow-sm active:scale-95"
          >
            <CreditCard size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transactions réelles                                                 */
/* ------------------------------------------------------------------ */

function txShopName(tx: { shopId: string | null }, shops: Establishment[]) {
  if (!tx.shopId) return "PAYZIK";
  return shops.find((s) => s.id === tx.shopId)?.name ?? "Boutique du réseau";
}

function TransactionRow({
  tx,
  shops,
}: {
  tx: { id: string; type: string; amount: number; description: string | null; shopId: string | null; createdAt: string };
  shops: Establishment[];
}) {
  const topUp = /recharge|repayment|refund/.test(tx.type);
  const date = new Date(tx.createdAt);
  return (
    <div className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${topUp ? "bg-[#EAF9F1] text-[#059669]" : "bg-[#FCEAF4] text-[#E91E83]"}`}>
        {topUp ? <ArrowDownToLine size={18} /> : <CheckCircle2 size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-[#21152C]">{txShopName(tx, shops)}</p>
        <p className="truncate text-[10px] text-[#81748A]">
          {tx.description || (topUp ? "Recharge" : "Paiement")} · {fmtDateSimple(date)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-mono text-[12px] font-bold ${topUp ? "text-[#059669]" : "text-[#21152C]"}`}>
          {topUp ? "+" : "−"}{fmtDh(tx.amount)}
        </p>
        <p className="text-[9.5px] text-[#81748A]">
          {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function fmtDateSimple(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function HistorySheet({
  open,
  onClose,
  spending,
  shops,
}: {
  open: boolean;
  onClose: () => void;
  spending: SpendingSummary;
  shops: Establishment[];
}) {
  type Filter = "all" | "payments" | "orders";
  const [filter, setFilter] = useState<Filter>("all");
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingOrders(true);
    listClientOrders().then((r) => {
      if (!alive) return;
      if (r.ok) setOrders(r.data);
      setLoadingOrders(false);
    });
    return () => { alive = false; };
  }, [open]);

  const payments = spending.recent;
  const showPayments = filter !== "orders";
  const showOrders = filter !== "payments";
  const empty = !loadingOrders && (
    (filter === "all" && payments.length === 0 && orders.length === 0) ||
    (filter === "payments" && payments.length === 0) ||
    (filter === "orders" && orders.length === 0)
  );

  return (
    <Sheet open={open} onClose={onClose} title="Mes Transactions">
      <div className="flex gap-1.5">
        {([
          ["all", "Toutes"],
          ["payments", "Paiements"],
          ["orders", "Commandes"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              filter === id ? "bg-[#E91E83] text-white" : "bg-[#F1E5FA] text-[#8136A8]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {showPayments && payments.map((t) => (
          <TransactionRow key={t.id} tx={t} shops={shops} />
        ))}

        {showOrders && orders.map((o) => {
          const date = new Date(o.created_at);
          const amount = o.items.reduce((s, i) => s + (i.priceDh ?? 0) * i.qty, 0);
          return (
            <div key={o.id} className="animate-fade-up flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F1E5FA] text-[#8136A8]">
                <ShoppingCart size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-[#21152C]">
                  {shops.find((s) => s.id === o.shop_id)?.name ?? "Commande"}
                </p>
                <p className="truncate text-[10px] text-[#81748A]">
                  {o.items.length} article(s) · {fmtDateSimple(date)} · {o.status}
                </p>
              </div>
              <p className="shrink-0 font-mono text-[12px] font-bold text-[#21152C]">
                {amount > 0 ? fmtDh(amount) : "—"}
              </p>
            </div>
          );
        })}

        {loadingOrders && filter === "orders" && (
          <div className="flex items-center gap-2 py-4 text-[11px] text-[#81748A]">
            <Clock3 size={14} className="animate-spin" /> Chargement des commandes…
          </div>
        )}

        {empty && (
          <Empty
            icon={<ReceiptText size={22} />}
            title="Aucune opération"
            hint="Vos paiements et commandes réels apparaîtront ici."
          />
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Modales                                                              */
/* ------------------------------------------------------------------ */

function ScanModal({
  open,
  onClose,
  onPick,
  shops,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (e: Establishment) => void;
  shops: Establishment[];
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
          <h3 className="text-[15px] font-bold text-[#21152C]">Scanner pour payer</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-[#81748A]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[240px] overflow-hidden rounded-2xl bg-[#21152C]">
          <span className="absolute left-3 top-3 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-[#E91E83]" />
          <span className="absolute right-3 top-3 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-[#E91E83]" />
          <span className="absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-[#E91E83]" />
          <span className="absolute bottom-3 right-3 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-[#E91E83]" />
          <div className="absolute inset-x-8 top-1/2 h-0.5 animate-scan-line bg-[#E91E83]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <QrCode size={64} className="text-white/15" />
          </div>
        </div>

        <p className="mt-3 text-center text-[12px] text-[#81748A]">
          Présentez le QR du commerçant · {left}s
        </p>
        <p className="mt-2 text-center text-[11px] font-semibold text-[#21152C]">
          Ou choisissez un commerçant
        </p>
        <div className="mt-2 max-h-[170px] space-y-1.5 overflow-y-auto">
          {shops.slice(0, 5).map((e) => {
            const Icon = KIND_ICON[e.kind];
            return (
              <button
                key={e.id}
                onClick={() => {
                  onClose();
                  onPick(e);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[#E9DDF2] p-2 text-left active:bg-[#FDF9FE]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1E5FA] text-[#E91E83]">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#21152C]">
                  {e.name}
                </span>
                <ChevronRight size={14} className="text-[#A08BAE]" />
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
  onShowQr,
}: {
  target: Establishment | null;
  card: PayzikCard | null;
  onClose: () => void;
  onConfirm: (target: Establishment, amount: number) => Promise<string | null>;
  onShowQr: () => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setAmount("");
      setError("");
    }
  }, [target]);

  if (!target) return null;

  const submit = async () => {
    setBusy(true);
    const err = await onConfirm(target, typeof amount === "number" ? amount : 0);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Paiement">
      {/* Boutique concernée */}
      <div className="overflow-hidden rounded-[20px] bg-gradient-to-br from-[#FCEAF4] to-[#F1E5FA]">
        <div className="flex h-24 items-center justify-center overflow-hidden">
          {target.image ? (
            <img src={target.image} alt={target.name} className="h-full w-full object-cover" />
          ) : (
            <ShoppingBag size={40} className="text-[#8136A8]/50" />
          )}
        </div>
        <div className="bg-white p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#81748A]">Paiement chez</p>
          <p className="mt-0.5 truncate text-[15px] font-extrabold text-[#21152C]">{target.name}</p>
          <p className="flex items-center gap-1 text-[10px] text-[#81748A]">
            <MapPin size={10} /> {[target.district, target.city].filter(Boolean).join(", ") || "Localisation non renseignée"}
          </p>
        </div>
      </div>

      {/* Montant */}
      <div className="mt-3 rounded-[20px] bg-[#FCEAF4] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#8136A8]">Montant à payer</p>
        <p className="mt-1 font-mono text-[28px] font-extrabold leading-none text-[#21152C]">
          {typeof amount === "number" ? fmtDh(amount) : "0,00 DH"}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[20, 50, 100, 200].map((v) => (
            <button
              key={v}
              onClick={() => { setAmount(v); setError(""); }}
              className={cx(
                "rounded-xl border py-2 font-mono text-[11px] font-bold transition active:scale-95",
                amount === v
                  ? "border-transparent bg-[#E91E83] text-white shadow-sm"
                  : "border-[#E9DDF2] bg-white text-[#21152C]",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => { setAmount(e.target.value ? Number(e.target.value) : ""); setError(""); }}
          placeholder="Autre montant (DH)"
          aria-label="Montant à payer"
          className="mt-2 h-10 w-full rounded-xl border border-[#E9DDF2] bg-white px-3 font-mono text-[13px] outline-none focus:border-[#E91E83]"
        />
      </div>

      {/* Solde disponible */}
      <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-[#F1E5FA] p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#8136A8] shadow-sm">
          <CreditCard size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-[#81748A]">Solde disponible</p>
          <p className="font-mono text-[15px] font-bold text-[#51206F]">
            {fmtDh(card?.balance_dh ?? 0)}
          </p>
        </div>
        <p className="truncate font-mono text-[9px] text-[#81748A]">{card?.code ?? "—"}</p>
      </div>

      {/* Carte bancaire — option visible, pas encore opérationnelle */}
      <button
        type="button"
        disabled
        aria-disabled
        className="mt-2.5 flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-dashed border-[#E9DDF2] bg-white/60 p-3 text-left opacity-70"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1E6] text-[#FF7A1A]">
          <CreditCard size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-[#21152C]">Carte bancaire</span>
          <span className="block text-[10px] text-[#81748A]">Bientôt disponible</span>
        </span>
      </button>

      {/* Total */}
      <div className="mt-3 flex items-end justify-between px-1">
        <span className="text-[12px] font-bold text-[#21152C]">Total</span>
        <span className="font-mono text-[20px] font-extrabold text-[#E91E83]">
          {typeof amount === "number" ? fmtDh(amount) : "0,00 DH"}
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded-xl bg-[#FCEAF4] px-3 py-2 text-[11px] font-semibold text-[#B31563]">
          {error}
        </div>
      )}

      <Btn
        className="mt-3 h-12 w-full !text-[12px] bg-gradient-to-r from-[#E91E83] to-[#F43F9E]"
        onClick={() => void submit()}
        disabled={busy || typeof amount !== "number" || amount <= 0}
      >
        <Check size={16} /> {busy ? "Envoi en cours…" : "Continuer"}
      </Btn>
      <p className="mt-1.5 text-center text-[9.5px] text-[#81748A]">
        Le paiement sera confirmé par la boutique après réception.
      </p>

      <button
        onClick={onShowQr}
        className="mt-2 w-full rounded-xl border border-[#E9DDF2] py-2.5 text-[10.5px] font-bold text-[#8136A8]"
      >
        Ou présenter mon QR au commerçant
      </button>
    </Sheet>
  );
}

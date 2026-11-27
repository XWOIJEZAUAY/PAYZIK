/** Espace CLIENT — accueil, carte, commerces et scanner. */
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  MapPin,
  Package,
  QrCode,
  ScanLine,
  Search,
  Store,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { listShops, type PayzikCard } from "../../services/backend/payzikCards";
import { requestCardPayment } from "../../services/backend/payzikOrders";
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
import { PartnerAdBanner } from "./PartnerAdBanner";
import { GoogleAdBanner } from "./GoogleAdBanner";
import { useClientCard } from "./useClientCard";
import {
  Avatar,
  Btn,
  cx,
  Empty,
  IconBtn,
  KIND_ICON,
  Pane,
  SectionHead,
  Sheet,
  TabBar,
} from "./ui";

export type ClientTab = "home" | "card" | "shops" | "catalog";

export const CLIENT_TABS: { id: ClientTab; label: string; icon: typeof Wallet }[] = [
  { id: "home", label: "Accueil", icon: Wallet },
  { id: "card", label: "Carte", icon: CreditCard },
  { id: "shops", label: "Boutiques", icon: Store },
  { id: "catalog", label: "Message", icon: Package },
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
  const [catalogShopId, setCatalogShopId] = useState("");
  const [hiddenPartnerAd, setHiddenPartnerAd] = useState("");
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
        location={[user.address, user.city].filter(Boolean).join(", ")}
        onProfile={onProfile}
        onBell={() => notify("Offres actives des boutiques")}
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
            onCatalog={() => openCatalog("")}
            onQr={() => setQrOpen(true)}
            onPay={setPayTarget}
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

      <TabBar value={tab} onChange={setTab} items={CLIENT_TABS} columns={4} />

      <ClientCardSheet
        open={qrOpen}
        card={card}
        name={name}
        onClose={() => setQrOpen(false)}
        onRecharge={() => setTab("card")}
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
    </>
  );
}

/* ------------------------------------------------------------------ */
/* En-tête client                                                       */
/* ------------------------------------------------------------------ */

function ClientHeader({
  name,
  location,
  onProfile,
  onBell,
  image,
}: {
  name: string;
  location: string;
  onProfile: () => void;
  onBell: () => void;
  image?: string | null;
}) {
  return (
    <header className="shrink-0 border-b border-[#E2E8F0] bg-white px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="flex items-center gap-2.5">
        <Avatar name={name} image={image} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-[#0F172A]">Salut, {name}</p>
          <p className="text-[9.5px] font-semibold uppercase tracking-wider text-[#FF5200]">Espace client</p>
        </div>
        <IconBtn onClick={onBell} label="Notifications">
          <Bell size={17} />
        </IconBtn>
        <button
          onClick={onProfile}
          aria-label="Mon profil"
          className="rounded-full bg-[#FF7A1A] px-2.5 py-1.5 text-[11px] font-bold text-white"
        >
          Profil
        </button>
      </div>
      <button className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-[#FFF1EA] px-2.5 py-1 text-[10.5px] font-semibold text-[#9A3412]">
        <MapPin size={11} className="shrink-0 text-[#FF5200]" />
        <span className="truncate">{location || "Ville non renseignée"}</span>
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
  onCard,
  onShops,
  onCatalog,
  onQr,
  onPay,
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
  onCatalog: () => void;
  onQr: () => void;
  onPay: (e: Establishment) => void;
  spending: SpendingSummary;
  shops: Establishment[];
  ads: Ad[];
  partnerAds: PartnerAd[];
  hiddenPartnerAd: string;
  onHidePartnerAd: (id: string) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const nearby = shops.slice(0, 3);
  const partnerAd = partnerAds.find((a) => a.id !== hiddenPartnerAd);

  return (
    <div className="animate-fade-up space-y-2.5">
      <GoogleAdBanner />
      {partnerAd && (
        <PartnerAdBanner ad={partnerAd} onHide={() => onHidePartnerAd(partnerAd.id)} />
      )}

      <Pane className="p-3.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium text-[#64748B]">
              Solde PAYZIK
              <button onClick={() => setHidden((h) => !h)} aria-label="Masquer le solde">
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </p>
            <p className="mt-0.5 font-mono text-[24px] font-bold leading-none text-[#0F172A]">
              {hidden ? "•••• DH" : fmtDh(card?.balance_dh ?? 0)}
            </p>
            <button onClick={onQr} className="mt-1 font-mono text-[10px] text-[#FF5200]">
              {card?.code ?? "Carte PAYZIK"} · voir le QR
            </button>
            <p className="mt-1 text-[10px] font-semibold text-[#64748B]">
              Dépensé ce mois · {fmtDh(spending.spentMonth)}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
            <Wallet size={16} />
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn className="h-10 !text-[11px]" onClick={onScan}>
            <ScanLine size={15} /> Payer
          </Btn>
          <Btn variant="soft" className="h-10 !text-[11px]" onClick={onQr}>
            <QrCode size={15} /> Mon QR
          </Btn>
        </div>
      </Pane>

      <div className="grid grid-cols-3 gap-2">
        <Quick icon={Wallet} label="Portefeuille" onClick={onCard} />
        <Quick icon={Zap} label="Offres" onClick={onShops} />
        <Quick icon={Package} label="Commander" onClick={onCatalog} />
      </div>

      {ads[0] && (
        <div className="space-y-2">
          <SectionHead title="Offres du réseau" action="Tout voir" onAction={onShops} />
          <AdBanner ad={ads[0]} onClick={onShops} />
        </div>
      )}

      <div className="space-y-2">
        <SectionHead title="Boutiques" action="Tout voir" onAction={onShops} />
        {nearby.map((e) => (
          <ShopRow key={e.id} e={e} onPay={() => onPay(e)} />
        ))}
      </div>
      <button
        onClick={onRecharge}
        className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 text-[10.5px] font-semibold text-[#64748B]"
      >
        Recharger ma carte
      </button>
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
      className="relative flex flex-col items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 shadow-sm transition active:scale-[.98]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
        <Icon size={16} />
      </span>
      <span className="text-[9.5px] font-semibold text-[#0F172A]">{label}</span>
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
    <div className="flex items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white p-2.5 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-bold text-[#0F172A]">{e.name}</p>
        <p className="flex items-center gap-1 text-[10px] text-[#64748B]">
          <MapPin size={10} /> {e.district}
        </p>
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

function AdBanner({ ad, onClick }: { ad: Ad; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#FF7A1A] via-[#FF5200] to-[#C2410C] p-3 text-left text-white shadow-sm active:scale-[.99]"
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
  spending,
}: {
  card: PayzikCard | null;
  name: string;
  notify: (m: string) => void;
  onRefresh: () => Promise<unknown> | void;
  onQr: () => void;
  spending: SpendingSummary;
}) {
  return (
    <div className="animate-fade-up space-y-2.5">
      <div className="rounded-2xl bg-gradient-to-br from-[#FF5200] to-[#FF8A3D] p-4 text-white shadow-md">
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

      <button
        onClick={onQr}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-[#FF5200] bg-[#FFF1EA] text-[11px] font-bold text-[#FF5200]"
      >
        <QrCode size={14} /> Afficher mon QR
      </button>

      <Pane className="p-3.5">
        <h2 className="text-[12px] font-bold text-[#0F172A]">Portefeuille</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#F8FAFC] p-2 text-center">
            <p className="text-[9px] text-[#64748B]">Solde</p>
            <p className="font-mono text-[12px] font-bold text-[#0F172A]">
              {fmtDh(card?.balance_dh ?? 0)}
            </p>
          </div>
          <div className="rounded-xl bg-[#FFF1EA] p-2 text-center">
            <p className="text-[9px] text-[#9A3412]">Dépensé</p>
            <p className="font-mono text-[12px] font-bold text-[#FF5200]">
              {fmtDh(spending.spentMonth)}
            </p>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] p-2 text-center">
            <p className="text-[9px] text-[#64748B]">Rechargé</p>
            <p className="font-mono text-[12px] font-bold text-[#0F172A]">
              {fmtDh(spending.toppedAll)}
            </p>
          </div>
        </div>
        {spending.recent.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-[#F1F5F9] pt-2">
            {spending.recent.slice(0, 3).map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[10.5px]">
                <span className="truncate text-[#64748B]">
                  {t.description || "Paiement"} · {new Date(t.createdAt).toLocaleDateString("fr-MA")}
                </span>
                <span className="font-mono font-bold text-[#0F172A]">-{fmtDh(t.amount)}</span>
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

      {ads[0] && <AdBanner ad={ads[0]} onClick={() => notify("Offre ajoutée à ton carnet")} />}

      <div className="space-y-2">
        {list.map((e) => (
          <ShopCard
            key={e.id}
            e={e}
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
  onPay,
  onCatalog,
}: {
  e: Establishment;
  onPay: () => void;
  onCatalog: () => void;
}) {
  const Icon = KIND_ICON[e.kind];
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-start gap-2.5 p-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold text-[#0F172A]">{e.name}</p>
              <p className="flex items-center gap-1 text-[10px] text-[#64748B]">
                <MapPin size={10} /> {e.district}, {e.city}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-[#F1F5F9] px-2.5 py-1.5">
        <button
          onClick={onCatalog}
          className="flex-1 rounded-md border border-[#E2E8F0] py-1 text-[10px] font-bold text-[#64748B]"
        >
          Produits
        </button>
        <button
          onClick={onPay}
          className="flex-1 rounded-md bg-[#FF5200] py-1 text-[10px] font-bold text-white active:scale-95"
        >
          Payer
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
          {shops.slice(0, 5).map((e) => {
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
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF1EA] text-[#FF5200]">
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
    <Sheet open onClose={onClose} title="Payer">
      <div className="rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF5200] p-3 text-white">
        <p className="text-[9px] uppercase tracking-wider text-white/70">Paiement chez</p>
        <p className="text-[14px] font-bold">{target.name}</p>
      </div>

      <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#E2E8F0] px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64748B]">
          <CreditCard size={13} /> {card?.code ?? "—"}
        </span>
        <span className="font-mono text-[11px] font-bold text-[#0F172A]">
          {fmtDh(card?.balance_dh ?? 0)}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {[20, 50, 100, 200].map((v) => (
          <button
            key={v}
            onClick={() => { setAmount(v); setError(""); }}
            className={cx(
              "rounded-lg border py-1.5 font-mono text-[11px] font-bold transition",
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
        onChange={(e) => { setAmount(e.target.value ? Number(e.target.value) : ""); setError(""); }}
        placeholder="Autre montant"
        className="mt-2 h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 font-mono text-[12px] outline-none focus:border-[#FF5200]"
      />

      {error && <p className="mt-2 text-[10.5px] font-semibold text-rose-600">{error}</p>}

      <Btn
        className="mt-2.5 w-full !text-[11px]"
        onClick={() => void submit()}
        disabled={busy || typeof amount !== "number" || amount <= 0}
      >
        <Check size={14} /> {busy ? "Envoi…" : `Envoyer ${typeof amount === "number" ? fmtDh(amount) : ""}`}
      </Btn>

      <button
        onClick={onShowQr}
        className="mt-2 w-full rounded-lg border border-[#E2E8F0] py-2 text-[10.5px] font-bold text-[#64748B]"
      >
        Ou présenter mon code / QR au commerçant
      </button>
    </Sheet>
  );
}

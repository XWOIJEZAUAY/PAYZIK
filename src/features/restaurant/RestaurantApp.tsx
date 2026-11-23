/** Espace Restaurant : commande à table (sans serveur) + cuisine/service connectés.
 *  Le client choisit sa table et ses plats, la cuisine reçoit la commande,
 *  la caisse encaisse avec les mêmes moyens de paiement que le reste du réseau. */
import {
  ArrowRight,
  Banknote,
  Check,
  ChefHat,
  Clock,
  CreditCard,
  Flame,
  GlassWater,
  IceCream,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Soup,
  Sparkles,
  Table2,
  Trash2,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BoltIcon } from "../../components/brand/Logo";
import { Badge, Button, Card, cn, StatusDot } from "../../components/ui";
import { fmtDh } from "../../lib/format";
import type { Store as StoreType } from "../../state/store";
import { useNetwork } from "../../state/network";
import type { MenuCategory, MenuItem, OrderLine, RestaurantOrder } from "../../types";

type Tab = "order" | "service";

const CATEGORIES: ("Tout" | MenuCategory)[] = [
  "Tout",
  "Entrées",
  "Plats",
  "Grillades",
  "Boissons",
  "Desserts",
];

const CATEGORY_ICON: Record<MenuCategory, typeof Soup> = {
  Entrées: Soup,
  Plats: UtensilsCrossed,
  Grillades: Flame,
  Boissons: GlassWater,
  Desserts: IceCream,
};

const CATEGORY_TONE: Record<MenuCategory, string> = {
  Entrées: "from-emerald-600 to-teal",
  Plats: "from-[#0B2846] to-[#123A63]",
  Grillades: "from-rose-600 to-amber-500",
  Boissons: "from-sky-600 to-cyan-400",
  Desserts: "from-fuchsia-600 to-rose-400",
};

const STATUS: Record<
  RestaurantOrder["status"],
  { label: string; tone: "amber" | "teal" | "emerald"; dot: string }
> = {
  new: { label: "Nouvelle", tone: "amber", dot: "bg-amber-500" },
  preparing: { label: "En préparation", tone: "teal", dot: "bg-teal" },
  served: { label: "Servi", tone: "emerald", dot: "bg-emerald-500" },
};

type Method = "cash" | "card" | "kridi";

const METHODS: { id: Method; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Espèces", icon: Banknote },
  { id: "card", label: "Carte PAYZIK", icon: CreditCard },
  { id: "kridi", label: "Kridi", icon: Receipt },
];

export function RestaurantApp({
  store,
  onSwitchProfile,
}: {
  store: StoreType;
  onSwitchProfile: () => void;
}) {
  const network = useNetwork();
  const [tab, setTab] = useState<Tab>("order");
  const [tableNo, setTableNo] = useState<number | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<"Tout" | MenuCategory>("Tout");
  const [method, setMethod] = useState<Method>("card");
  const [customerName, setCustomerName] = useState(network.customer.name);
  const [cardCode, setCardCode] = useState(network.customer.cardCode);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<RestaurantOrder | null>(null);
  const [payOrder, setPayOrder] = useState<RestaurantOrder | null>(null);

  const menu = network.menu;
  const orders = network.orders;

  const activeOrders = orders.filter((o) => o.status !== "served" || !o.paid);

  const lines: OrderLine[] = menu
    .filter((m) => (cart[m.id] ?? 0) > 0)
    .map((m) => ({ name: m.name, qty: cart[m.id], priceDh: m.priceDh }));

  const total = lines.reduce((s, l) => s + l.priceDh * l.qty, 0);

  const menuList = useMemo(
    () => menu.filter((m) => category === "Tout" || m.category === category),
    [menu, category],
  );

  const foundCard = store.findCardByCode(cardCode);

  const add = (id: string) =>
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const remove = (id: string) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) };
      if (next[id] === 0) delete next[id];
      return next;
    });

  const resetOrder = () => {
    setCart({});
    setError("");
  };

  /** Enregistre le paiement selon le moyen choisi. Renvoie un message d'erreur ou null. */
  const settle = (
    amount: number,
    who: string,
    table: number,
    items?: OrderLine[],
  ): string | null => {
    if (method === "card") {
      const card = store.findCardByCode(cardCode);
      if (!card) return "Code carte PAYZIK introuvable. Vérifie le code.";
      if (card.balanceDh < amount)
        return `Solde insuffisant : ${fmtDh(card.balanceDh)} disponibles.`;
      const ok = store.payWithCard(
        card.id,
        amount,
        `Restaurant Dar Zitoun · Table ${table}`,
      );
      if (!ok) return "Paiement carte refusé.";
      return null;
    }
    if (method === "kridi") {
      const name = who.trim() || "Client";
      const existing = store.clients.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      const client = existing ?? store.addClient(name);
      store.addDebt(
        client.id,
        amount,
        `Restaurant Dar Zitoun · Table ${table}`,
        items,
      );
    }
    return null;
  };

  const sendOrder = () => {
    if (tableNo === null) {
      setError("Choisis d'abord une table.");
      return;
    }
    if (lines.length === 0) {
      setError("Ajoute au moins un plat.");
      return;
    }
    setError("");
    const err = settle(total, customerName, tableNo, lines);
    if (err) {
      setError(err);
      return;
    }
    const order = network.createOrder({
      tableNo,
      lines,
      totalDh: total,
      status: "new",
      paid: true,
      method,
      customerName: customerName.trim() || "Client",
      cardCode: method === "card" ? cardCode.trim().toUpperCase() : undefined,
    });
    setSent(order);
    resetOrder();
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------------- barre haute ---------------- */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060D18]">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BoltIcon size={26} />
            <span className="text-[19px] font-black tracking-tight text-white">PAYZIK</span>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300 sm:inline-flex">
            <ChefHat size={12} /> Dar Zitoun
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/65 md:inline-flex">
              <StatusDot tone="emerald">Service connecté</StatusDot>
            </span>
            <Button
              variant="ghost"
              onClick={onSwitchProfile}
              className="!px-3 !py-2 text-xs !text-white/70 hover:!bg-white/10 hover:!text-white"
            >
              Changer de profil
            </Button>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          <button
            onClick={() => setTab("order")}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
              tab === "order" ? "text-white" : "text-white/45 hover:text-white/75",
            )}
          >
            <UtensilsCrossed size={15} className={tab === "order" ? "text-teal" : ""} />
            Commander à table
            {tab === "order" && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal" />
            )}
          </button>
          <button
            onClick={() => setTab("service")}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3.5 py-3 text-[13px] font-semibold transition-colors",
              tab === "service" ? "text-white" : "text-white/45 hover:text-white/75",
            )}
          >
            <ChefHat size={15} className={tab === "service" ? "text-teal" : ""} />
            Cuisine & service
            {activeOrders.length > 0 && (
              <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {activeOrders.length}
              </span>
            )}
            {tab === "service" && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal" />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === "order" && (
          <OrderView
            tableNo={tableNo}
            setTableNo={setTableNo}
            orders={orders}
            menu={menuList}
            menuAll={menu}
            menuCount={menu.length}
            category={category}
            setCategory={setCategory}
            cart={cart}
            add={add}
            remove={remove}
            lines={lines}
            total={total}
            method={method}
            setMethod={setMethod}
            customerName={customerName}
            setCustomerName={setCustomerName}
            cardCode={cardCode}
            setCardCode={setCardCode}
            cardName={foundCard?.name}
            cardBalance={foundCard?.balanceDh}
            error={error}
            onSend={sendOrder}
            onClear={resetOrder}
          />
        )}
        {tab === "service" && (
          <ServiceView
            orders={orders}
            busyTables={new Set(
              orders.filter((o) => o.status !== "served").map((o) => o.tableNo),
            )}
            onStatus={(order, status) => network.updateOrder(order.id, { status })}
            onPay={(order) => setPayOrder(order)}
            onGoOrder={() => setTab("order")}
          />
        )}
      </main>

      {/* commande envoyée */}
      {sent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-navy-deep/50 backdrop-blur-md"
            onClick={() => setSent(null)}
          />
          <div className="relative w-full max-w-sm animate-scale-in rounded-3xl border bg-surface p-6 text-center shadow-pop">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Check size={26} />
            </span>
            <h3 className="mt-4 text-lg font-black tracking-tight text-ink">
              Commande envoyée en cuisine
            </h3>
            <p className="mt-1 text-sm text-muted">
              Table <span className="font-bold text-ink">{sent.tableNo}</span> ·{" "}
              {sent.lines.reduce((s, l) => s + l.qty, 0)} article
              {sent.lines.reduce((s, l) => s + l.qty, 0) > 1 ? "s" : ""} ·{" "}
              {fmtDh(sent.totalDh)}
            </p>
            <div className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-left">
              {sent.lines.map((l) => (
                <p key={l.name} className="flex justify-between text-[11.5px] text-muted">
                  <span>
                    {l.qty} × {l.name}
                  </span>
                  <span className="money font-semibold text-ink">
                    {fmtDh(l.priceDh * l.qty)}
                  </span>
                </p>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setSent(null)}>
                Continuer
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  setSent(null);
                  setTab("service");
                }}
              >
                Voir en cuisine <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}

      <PayOrderModal
        order={payOrder}
        method={method}
        setMethod={setMethod}
        cardCode={cardCode}
        setCardCode={setCardCode}
        cardName={foundCard?.name}
        onClose={() => setPayOrder(null)}
        onConfirm={(order) => {
          const err = settle(
            order.totalDh,
            order.customerName ?? "Client",
            order.tableNo,
            order.lines,
          );
          if (err) return err;
          network.updateOrder(order.id, {
            paid: true,
            method,
            cardCode: method === "card" ? cardCode.trim().toUpperCase() : undefined,
          });
          setPayOrder(null);
          return null;
        }}
      />
    </div>
  );
}

/* ================================================================
   COMMANDER À TABLE
   ================================================================ */

function OrderView({
  tableNo,
  setTableNo,
  orders,
  menu,
  menuAll,
  menuCount,
  category,
  setCategory,
  cart,
  add,
  remove,
  lines,
  total,
  method,
  setMethod,
  customerName,
  setCustomerName,
  cardCode,
  setCardCode,
  cardName,
  cardBalance,
  error,
  onSend,
  onClear,
}: {
  tableNo: number | null;
  setTableNo: (n: number | null) => void;
  orders: RestaurantOrder[];
  menu: MenuItem[];
  menuAll: MenuItem[];
  menuCount: number;
  category: "Tout" | MenuCategory;
  setCategory: (c: "Tout" | MenuCategory) => void;
  cart: Record<string, number>;
  add: (id: string) => void;
  remove: (id: string) => void;
  lines: OrderLine[];
  total: number;
  method: Method;
  setMethod: (m: Method) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  cardCode: string;
  setCardCode: (v: string) => void;
  cardName?: string;
  cardBalance?: number;
  error: string;
  onSend: () => void;
  onClear: () => void;
}) {
  const busy = new Map<number, RestaurantOrder>();
  for (const o of orders) {
    if (o.status !== "served") busy.set(o.tableNo, o);
  }

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink">
            {tableNo === null ? "Choisis ta table" : `Table ${tableNo} — commande`}
          </h1>
          <p className="text-sm text-muted">
            {tableNo === null
              ? "Un clic sur la table, puis compose ton menu. Aucun serveur nécessaire."
              : "Touche les plats pour les ajouter, la cuisine reçoit tout en direct."}
          </p>
        </div>
        {tableNo !== null && (
          <Button variant="secondary" onClick={() => setTableNo(null)}>
            <RefreshCw size={14} /> Changer de table
          </Button>
        )}
      </div>

      {tableNo === null ? (
        <>
          <div className="rounded-2xl border border-teal/25 bg-accent-soft/40 px-4 py-3 text-[12.5px] font-medium text-teal-deep">
            <span className="font-bold">Comment ça marche :</span> tu choisis ta table, tu
            touches tes plats, tu paies avec ta carte PAYZIK — et la cuisine sait quoi
            préparer et pour quelle table.
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const order = busy.get(n);
              return (
                <button
                  key={n}
                  onClick={() => setTableNo(n)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop",
                    order
                      ? "border-amber-200 bg-amber-50"
                      : "bg-surface hover:border-teal/40",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        order ? "bg-amber-500 text-white" : "bg-navy text-teal-glow",
                      )}
                    >
                      <Table2 size={18} />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        order
                          ? "bg-amber-500/15 text-amber-700"
                          : "bg-emerald-50 text-emerald-600",
                      )}
                    >
                      {order ? "Occupée" : "Libre"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-black text-ink">Table {n}</p>
                  <p className="text-[11px] text-muted">
                    {order
                      ? `${order.customerName ?? "Client"} · ${fmtDh(order.totalDh)}`
                      : "2 à 4 couverts"}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-teal-deep opacity-0 transition-opacity group-hover:opacity-100">
                    Choisir <ArrowRight size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* menu */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all",
                    category === c
                      ? "border-transparent bg-navy text-white"
                      : "bg-surface text-muted hover:border-teal/40 hover:text-ink",
                  )}
                >
                  {c}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-muted">
                {menu.length} / {menuCount} plats
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {menu.map((m) => {
                const qty = cart[m.id] ?? 0;
                const Icon = CATEGORY_ICON[m.category];
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border bg-surface p-3.5 transition-all",
                      qty > 0 ? "border-teal/50 shadow-card" : "hover:border-teal/30",
                      !m.available && "opacity-55",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                          CATEGORY_TONE[m.category],
                        )}
                      >
                        <Icon size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold text-ink">{m.name}</p>
                        <p className="line-clamp-2 text-[10.5px] leading-snug text-muted">
                          {m.description}
                        </p>
                        <p className="money mt-1 text-[13px] font-black text-teal-deep">
                          {fmtDh(m.priceDh)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {m.available ? m.category : "Indisponible"}
                      </span>
                      {m.available &&
                        (qty > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => remove(m.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted transition-colors hover:bg-surface2"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="tnum w-5 text-center text-sm font-black text-ink">
                              {qty}
                            </span>
                            <button
                              onClick={() => add(m.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-white transition-colors hover:bg-navy-soft"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => add(m.id)}
                            className="flex items-center gap-1 rounded-lg bg-teal px-2.5 py-1.5 text-[11px] font-bold text-navy transition-transform hover:scale-[1.03]"
                          >
                            <Plus size={12} /> Ajouter
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ticket */}
          <aside className="lg:sticky lg:top-[132px] lg:self-start">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                    Ticket · Table
                  </p>
                  <p className="text-lg font-black">{tableNo}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    {lines.reduce((s, l) => s + l.qty, 0)} article
                    {lines.reduce((s, l) => s + l.qty, 0) > 1 ? "s" : ""}
                  </p>
                  <p className="money text-xl font-black">{fmtDh(total)}</p>
                </div>
              </div>

              <div className="max-h-[300px] space-y-2 overflow-y-auto p-4 scrollbar-thin">
                {lines.length === 0 && (
                  <p className="rounded-xl bg-surface2 px-3 py-8 text-center text-[12px] text-muted">
                    Touche un plat pour commencer la commande.
                  </p>
                )}
                {lines.map((l) => {
                  const item = menuAll.find((m) => m.name === l.name);
                  if (!item) return null;
                  return (
                    <div key={l.name} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-bold text-ink">{l.name}</p>
                        <p className="money text-[10.5px] text-muted">{fmtDh(l.priceDh)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => remove(item.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted hover:bg-surface2"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="tnum w-4 text-center text-[12px] font-black">{l.qty}</span>
                        <button
                          onClick={() => add(item.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-white"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="money w-16 shrink-0 text-right text-[12px] font-black text-ink">
                        {fmtDh(l.priceDh * l.qty)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3 border-t bg-surface2/40 p-4">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Nom du client
                  </span>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex. Khadija"
                    className="h-10 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
                  />
                </label>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    Paiement
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {METHODS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setMethod(id)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-bold transition-all",
                          method === id
                            ? "border-teal bg-accent-soft text-teal-deep"
                            : "bg-surface text-muted hover:border-teal/30",
                        )}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {method === "card" && (
                  <div>
                    <input
                      value={cardCode}
                      onChange={(e) => setCardCode(e.target.value)}
                      placeholder="Code carte PZK-…"
                      className="tnum h-10 w-full rounded-xl border bg-surface px-3 text-[12px] font-bold uppercase outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
                    />
                    <p
                      className={cn(
                        "mt-1 text-[10.5px] font-semibold",
                        cardName ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {cardName
                        ? `${cardName} · solde ${fmtDh(cardBalance ?? 0)}`
                        : "Carte introuvable — vérifie le code."}
                    </p>
                  </div>
                )}
                {method === "kridi" && (
                  <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-medium text-amber-700">
                    La commande sera ajoutée au carnet kridi de {customerName || "ce client"}.
                  </p>
                )}
                {method === "cash" && (
                  <p className="rounded-lg bg-surface px-2.5 py-1.5 text-[10.5px] font-medium text-muted">
                    Encaissement espèces à la table.
                  </p>
                )}

                {error && (
                  <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Total
                  </span>
                  <span className="money text-2xl font-black text-ink">{fmtDh(total)}</span>
                </div>

                <div className="flex gap-2">
                  <Button variant="ghost" className="!px-3" onClick={onClear} title="Vider">
                    <Trash2 size={16} />
                  </Button>
                  <Button
                    variant="accent"
                    className="flex-1 !py-3"
                    disabled={lines.length === 0}
                    onClick={onSend}
                  >
                    <ChefHat size={16} /> Envoyer en cuisine
                  </Button>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   CUISINE & SERVICE
   ================================================================ */

function ServiceView({
  orders,
  busyTables,
  onStatus,
  onPay,
  onGoOrder,
}: {
  orders: RestaurantOrder[];
  busyTables: Set<number>;
  onStatus: (order: RestaurantOrder, status: RestaurantOrder["status"]) => void;
  onPay: (order: RestaurantOrder) => void;
  onGoOrder: () => void;
}) {
  const [showDone, setShowDone] = useState(false);

  const active = orders.filter((o) => o.status !== "served" || !o.paid);
  const done = orders.filter((o) => o.status === "served" && o.paid);
  const list = showDone ? done : active;

  const paidToday = orders
    .filter((o) => o.paid)
    .reduce((s, o) => s + o.totalDh, 0);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink">Cuisine & service</h1>
          <p className="text-sm text-muted">
            Chaque commande arrive avec sa table et ses plats — sans serveur.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot tone="emerald">Temps réel</StatusDot>
          <Button variant="primary" onClick={onGoOrder}>
            <Plus size={15} /> Nouvelle commande
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Commandes en cours
          </p>
          <p className="mt-1 text-2xl font-black text-ink">{active.length}</p>
        </Card>
        <Card className="!rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Tables occupées
          </p>
          <p className="mt-1 text-2xl font-black text-ink">{busyTables.size}</p>
        </Card>
        <Card className="!rounded-xl bg-navy p-4 text-white">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-glow">
            Encaissé aujourd'hui
          </p>
          <p className="money mt-1 text-2xl font-black">{fmtDh(paidToday)}</p>
        </Card>
      </div>

      {/* plan de salle */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13px] font-extrabold tracking-tight text-ink">
            <Table2 size={15} /> Plan de salle
          </h3>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-surface2 ring-1 ring-line" /> Libre
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Occupée
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-xl border text-[11px] font-black",
                busyTables.has(n)
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "bg-surface2/50 text-muted",
              )}
            >
              {n}
              <span className="text-[8px] font-semibold uppercase tracking-wider opacity-70">
                {busyTables.has(n) ? "occupée" : "libre"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDone(false)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all",
            !showDone ? "border-transparent bg-navy text-white" : "bg-surface text-muted",
          )}
        >
          En cours ({active.length})
        </button>
        <button
          onClick={() => setShowDone(true)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all",
            showDone ? "border-transparent bg-navy text-white" : "bg-surface text-muted",
          )}
        >
          Terminées ({done.length})
        </button>
      </div>

      {list.length === 0 ? (
        <Card className="p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-teal-deep">
            <ChefHat size={22} />
          </span>
          <p className="mt-3 text-sm font-bold text-ink">
            {showDone ? "Aucune commande terminée." : "Aucune commande en cours."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {showDone
              ? "Les tables libérées apparaîtront ici."
              : "Les commandes passées à table arrivent ici instantanément."}
          </p>
          {!showDone && (
            <Button variant="primary" className="mt-4" onClick={onGoOrder}>
              <UtensilsCrossed size={15} /> Prendre une commande
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => {
            const st = STATUS[o.status];
            return (
              <Card key={o.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-base font-black text-teal-glow">
                      {o.tableNo}
                    </span>
                    <div>
                      <p className="text-[13px] font-extrabold text-ink">Table {o.tableNo}</p>
                      <p className="text-[10.5px] text-muted">
                        {o.customerName ?? "Client"} ·{" "}
                        {new Date(o.createdAt).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <Badge tone={st.tone} icon={<span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />}>
                    {st.label}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1.5 border-t pt-3">
                  {o.lines.map((l) => (
                    <div key={l.name} className="flex justify-between gap-2 text-[11.5px]">
                      <span className="min-w-0 truncate font-semibold text-ink">
                        <span className="tnum text-muted">{l.qty}×</span> {l.name}
                      </span>
                      <span className="money shrink-0 font-bold text-ink">
                        {fmtDh(l.priceDh * l.qty)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-1.5">
                    {o.paid ? (
                      <Badge tone="emerald" icon={<Check size={10} />}>
                        Payé
                      </Badge>
                    ) : (
                      <Badge tone="rose" icon={<Clock size={10} />}>
                        À encaisser
                      </Badge>
                    )}
                    {o.method && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-muted">
                        {o.method === "card" ? (
                          <CreditCard size={11} />
                        ) : o.method === "kridi" ? (
                          <Receipt size={11} />
                        ) : (
                          <Banknote size={11} />
                        )}
                        {o.method === "card"
                          ? "PAYZIK"
                          : o.method === "kridi"
                            ? "Kridi"
                            : "Espèces"}
                      </span>
                    )}
                  </div>
                  <span className="money text-base font-black text-ink">{fmtDh(o.totalDh)}</span>
                </div>

                <div className="mt-3 flex gap-1.5">
                  {o.status === "new" && (
                    <Button
                      variant="secondary"
                      className="flex-1 !py-2 text-[11px]"
                      onClick={() => onStatus(o, "preparing")}
                    >
                      <Flame size={13} /> En préparation
                    </Button>
                  )}
                  {o.status === "preparing" && (
                    <Button
                      variant="secondary"
                      className="flex-1 !py-2 text-[11px]"
                      onClick={() => onStatus(o, "served")}
                    >
                      <Check size={13} /> Marquer servi
                    </Button>
                  )}
                  {o.status === "served" && (
                    <span className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-50 py-2 text-[11px] font-bold text-emerald-700">
                      <Sparkles size={13} /> Servi
                    </span>
                  )}
                  {!o.paid && (
                    <Button
                      variant="accent"
                      className="flex-1 !py-2 text-[11px]"
                      onClick={() => onPay(o)}
                    >
                      <Wallet size={13} /> Encaisser
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-2 pt-2 text-[11px] text-muted">
        <Users size={13} /> Le client suit l'état de sa commande depuis son espace PAYZIK.
      </p>
    </div>
  );
}

/* ================================================================
   MODALE D'ENCAISSEMENT
   ================================================================ */

function PayOrderModal({
  order,
  method,
  setMethod,
  cardCode,
  setCardCode,
  cardName,
  onClose,
  onConfirm,
}: {
  order: RestaurantOrder | null;
  method: Method;
  setMethod: (m: Method) => void;
  cardCode: string;
  setCardCode: (v: string) => void;
  cardName?: string;
  onClose: () => void;
  onConfirm: (order: RestaurantOrder) => string | null;
}) {
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [order?.id]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-deep/45 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-3xl border bg-surface p-5 shadow-pop">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              Encaisser la table
            </p>
            <h3 className="mt-1 text-2xl font-black text-ink">Table {order.tableNo}</h3>
            <p className="text-[11.5px] text-muted">
              {order.customerName ?? "Client"} · {order.lines.length} plat
              {order.lines.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-surface2 px-3 py-2">
          {order.lines.map((l) => (
            <p key={l.name} className="flex justify-between text-[11.5px] text-muted">
              <span>
                {l.qty} × {l.name}
              </span>
              <span className="money font-semibold text-ink">{fmtDh(l.priceDh * l.qty)}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between border-t pt-1.5 text-[13px] font-black text-ink">
            <span>Total</span>
            <span className="money">{fmtDh(order.totalDh)}</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {METHODS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMethod(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-bold transition-all",
                method === id
                  ? "border-teal bg-accent-soft text-teal-deep"
                  : "bg-surface text-muted hover:border-teal/30",
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {method === "card" && (
          <div className="mt-2">
            <input
              value={cardCode}
              onChange={(e) => setCardCode(e.target.value)}
              placeholder="Code carte PZK-…"
              className="tnum h-10 w-full rounded-xl border bg-surface2 px-3 text-[12px] font-bold uppercase outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
            />
            <p
              className={cn(
                "mt-1 text-[10.5px] font-semibold",
                cardName ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {cardName ? `Carte trouvée : ${cardName}` : "Carte introuvable"}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onClick={() => {
              const err = onConfirm(order);
              if (err) setError(err);
            }}
          >
            <Check size={15} /> Encaisser {fmtDh(order.totalDh)}
          </Button>
        </div>
      </div>
    </div>
  );
}

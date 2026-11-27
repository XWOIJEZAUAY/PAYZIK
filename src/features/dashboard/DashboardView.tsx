import { Banknote, BookOpen, CreditCard, Receipt, Package, AlertTriangle, TrendingUp, Users, Wallet, BarChart3 } from "lucide-react";
import { fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import { Card, cn } from "../../components/ui";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function DashboardView({ store }: { store: Store }) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (iso: string, d: Date) =>
    startOfDay(new Date(iso)).getTime() === d.getTime();

  const todaySales = store.sales.filter((s) => isSameDay(s.date, today));
  const yesterdaySales = store.sales.filter((s) => isSameDay(s.date, yesterday));

  const totalToday = todaySales.reduce((s, x) => s + x.totalDh, 0);
  const totalYesterday = yesterdaySales.reduce((s, x) => s + x.totalDh, 0);
  const delta = totalYesterday > 0 ? ((totalToday - totalYesterday) / totalYesterday) * 100 : 0;

  const byMethod = (m: string, sales = todaySales) =>
    sales.filter((s) => s.method === m).reduce((s, x) => s + x.totalDh, 0);

  // Last 7 days revenue
  const last7: { label: string; value: number; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const daySales = store.sales.filter((s) => isSameDay(s.date, d));
    last7.push({
      label: DAY_LABELS[d.getDay()],
      value: daySales.reduce((s, x) => s + x.totalDh, 0),
      count: daySales.length,
    });
  }
  const maxDay = Math.max(1, ...last7.map((d) => d.value));

  // Sales by hour today
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const s of todaySales) byHour[new Date(s.date).getHours()] += s.totalDh;
  const maxHour = Math.max(1, ...byHour);

  // Top products by revenue (all time)
  const prodRev: Record<string, { name: string; qty: number; rev: number }> = {};
  for (const s of store.sales) {
    for (const l of s.lines) {
      if (!prodRev[l.name]) prodRev[l.name] = { name: l.name, qty: 0, rev: 0 };
      prodRev[l.name].qty += l.qty;
      prodRev[l.name].rev += l.priceDh * l.qty;
    }
  }
  const topProducts = Object.values(prodRev)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 6);
  const maxProdRev = Math.max(1, ...topProducts.map((p) => p.rev));

  // Payment method totals (all time)
  const methodTotals = {
    cash: store.sales.filter((s) => s.method === "cash").reduce((s, x) => s + x.totalDh, 0),
    kridi: store.sales.filter((s) => s.method === "kridi").reduce((s, x) => s + x.totalDh, 0),
    card: store.sales.filter((s) => s.method === "card").reduce((s, x) => s + x.totalDh, 0),
    wallet: store.sales.filter((s) => s.method === "wallet").reduce((s, x) => s + x.totalDh, 0),
  };
  const methodTotal = Object.values(methodTotals).reduce((s, v) => s + v, 0) || 1;

  // Stock alerts
  const lowStock = store.products.filter((p) => p.stock > 0 && p.stock <= 5);
  const outStock = store.products.filter((p) => p.stock <= 0);
  const totalStockValue = store.products.reduce((s, p) => s + p.priceDh * p.stock, 0);

  // Kridi
  const debtors = store.clients.filter((c) => c.debtDh > 0).sort((a, b) => b.debtDh - a.debtDh);
  const totalDebt = debtors.reduce((s, c) => s + c.debtDh, 0);

  // Cards
  const totalCardBalance = store.cards.reduce((s, c) => s + c.balanceDh, 0);

  // Avg basket
  const avgBasket = todaySales.length ? totalToday / todaySales.length : 0;

  const kpis = [
    { label: "Ventes du jour", value: fmtDh(totalToday), icon: Receipt, accent: true, trend: delta },
    { label: "Transactions", value: String(todaySales.length), icon: TrendingUp, trend: null },
    { label: "Panier moyen", value: fmtDh(avgBasket), icon: Banknote, trend: null },
    { label: "Espèces", value: fmtDh(byMethod("cash")), icon: Banknote, trend: null },
    { label: "Kridi (crédit)", value: fmtDh(byMethod("kridi")), icon: BookOpen, trend: null },
    { label: "Carte / TPE", value: fmtDh(byMethod("card")), icon: CreditCard, trend: null },
    { label: "Stock (valeur)", value: fmtDh(totalStockValue), icon: Package, trend: null },
    { label: "Cartes PAYZIK", value: fmtDh(totalCardBalance), icon: Wallet, trend: null },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-ink">
            <BarChart3 size={20} className="text-brand" /> Tableau de bord BI
          </h2>
          <p className="text-sm text-slate-400">
            {todaySales.length} transaction{todaySales.length > 1 ? "s" : ""} aujourd'hui ·{" "}
            {store.sales.length} au total
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CA hier</p>
          <p className="tnum text-sm font-bold text-slate-600">{fmtDh(totalYesterday)}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, accent, trend }) => (
          <Card
            key={label}
            className={cn(
              "group relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-pop",
              accent && "!border-transparent bg-ink text-white",
            )}
          >
            <div className="flex items-center justify-between">
              <Icon size={16} className={accent ? "text-brand" : "text-slate-400"} />
              {trend !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    trend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                    accent && (trend >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"),
                  )}
                >
                  {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(0)}%
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-2 text-[10px] font-semibold uppercase tracking-wider",
                accent ? "text-slate-300" : "text-slate-400",
              )}
            >
              {label}
            </p>
            <p className={cn("tnum mt-0.5 text-lg font-black", accent ? "text-white" : "text-ink")}>
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Ventes 7 jours */}
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Ventes — 7 derniers jours
          </p>
          <div className="flex items-end gap-2" style={{ height: 140 }}>
            {last7.map((d, i) => {
              const h = (d.value / maxDay) * 120;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="tnum text-[9px] font-bold text-slate-400">
                    {d.value > 0 ? fmtDh(d.value) : ""}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand to-teal transition-all duration-500"
                    style={{ height: Math.max(2, h) }}
                    title={`${d.label} : ${fmtDh(d.value)} (${d.count} tx)`}
                  />
                  <span className="text-[10px] font-semibold text-slate-500">{d.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Répartition paiements */}
        <Card className="p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Répartition paiements
          </p>
          <DonutChart totals={methodTotals} total={methodTotal} />
          <div className="mt-3 space-y-1.5">
            {[
              { label: "Espèces", value: methodTotals.cash, color: "#8136A8" },
              { label: "Kridi", value: methodTotals.kridi, color: "#F43F9E" },
              { label: "Carte", value: methodTotals.card, color: "#F43F9E" },
              { label: "Carte PAYZIK", value: methodTotals.wallet, color: "#8136A8" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-slate-600">{label}</span>
                </span>
                <span className="tnum font-bold text-ink">
                  {methodTotal > 0 ? ((value / methodTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ventes par heure */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          Ventes par heure (aujourd'hui)
        </p>
        <div className="flex items-end gap-0.5" style={{ height: 80 }}>
          {byHour.map((v, h) => (
            <div
              key={h}
              className="flex-1 rounded-t bg-gradient-to-t from-teal/40 to-teal transition-all"
              style={{ height: Math.max(1, (v / maxHour) * 70) }}
              title={`${h}h : ${fmtDh(v)}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-slate-400">
          <span>0h</span>
          <span>6h</span>
          <span>12h</span>
          <span>18h</span>
          <span>23h</span>
        </div>
      </Card>

      {/* Top produits + Stock alerts + Kridi + Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top produits */}
        <Card className="p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Top produits (CA)
          </p>
          {topProducts.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Aucune vente enregistrée.</p>
          )}
          <div className="space-y-2">
            {topProducts.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                  {p.name}
                </span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-teal"
                    style={{ width: `${(p.rev / maxProdRev) * 100}%` }}
                  />
                </div>
                <span className="tnum w-16 text-right text-[11px] font-bold text-ink">
                  {fmtDh(p.rev)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Alertes stock */}
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <AlertTriangle size={12} /> Alertes stock
          </p>
          {lowStock.length === 0 && outStock.length === 0 && (
            <p className="py-6 text-center text-sm text-emerald-600">Stock OK — aucun alerte.</p>
          )}
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {outStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs">
                <span className="font-semibold text-rose-700">{p.name}</span>
                <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                  Rupture
                </span>
              </div>
            ))}
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs">
                <span className="font-semibold text-amber-700">{p.name}</span>
                <span className="tnum rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {p.stock} restant{p.stock > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Kridi */}
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Users size={12} /> Carnet Kridi — top débiteurs
          </p>
          {debtors.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Aucun crédit en cours.</p>
          )}
          <div className="space-y-2">
            {debtors.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                  {c.name}
                </span>
                <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500"
                    style={{ width: `${totalDebt > 0 ? (c.debtDh / totalDebt) * 100 : 0}%` }}
                  />
                </div>
                <span className="tnum w-16 text-right text-[11px] font-bold text-rose-600">
                  {fmtDh(c.debtDh)}
                </span>
              </div>
            ))}
          </div>
          {debtors.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
              <span className="font-semibold text-slate-500">Total kridi</span>
              <span className="tnum font-black text-rose-600">{fmtDh(totalDebt)}</span>
            </div>
          )}
        </Card>

        {/* Cartes PAYZIK */}
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Wallet size={12} /> Cartes PAYZIK
          </p>
          {store.cards.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Aucune carte.</p>
          )}
          <div className="space-y-2">
            {store.cards.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{c.name}</span>
                <span className="tnum font-black text-teal-deep">{fmtDh(c.balanceDh)}</span>
              </div>
            ))}
          </div>
          {store.cards.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
              <span className="font-semibold text-slate-500">Solde total</span>
              <span className="tnum font-black text-teal-deep">{fmtDh(totalCardBalance)}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Dernières transactions */}
      <Card className="divide-y overflow-hidden">
        <p className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          Dernières transactions
        </p>
        {store.sales.slice(0, 12).map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50">
            <span className="tnum font-bold text-slate-400">#{s.ticketNo}</span>
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {s.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                s.method === "cash" && "bg-emerald-50 text-emerald-700",
                s.method === "kridi" && "bg-amber-50 text-amber-700",
                s.method === "card" && "bg-slate-100 text-slate-600",
                s.method === "wallet" && "bg-teal/10 text-teal-deep",
              )}
            >
              {s.method === "cash"
                ? "Espèces"
                : s.method === "kridi"
                  ? `Kridi · ${s.clientName}`
                  : s.method === "card"
                    ? "Carte"
                    : "Carte PAYZIK"}
            </span>
            <span className="tnum font-black text-ink">{fmtDh(s.totalDh)}</span>
          </div>
        ))}
        {store.sales.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            Aucune vente enregistrée — passe une commande dans la Caisse.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ---------- Donut chart (pur SVG) ---------- */
function DonutChart({
  totals,
  total,
}: {
  totals: { cash: number; kridi: number; card: number; wallet: number };
  total: number;
}) {
  const segments = [
    { value: totals.cash, color: "#8136A8" },
    { value: totals.kridi, color: "#F43F9E" },
    { value: totals.card, color: "#F43F9E" },
    { value: totals.wallet, color: "#8136A8" },
  ];
  const r = 40;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-28 w-28">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E9DDF2" strokeWidth={12} />
      {segments.map((seg, i) => {
        const len = total > 0 ? (seg.value / total) * circ : 0;
        const dash = `${len} ${circ - len}`;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={12}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="transition-all duration-700"
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="tnum text-[11px] font-black" fill="#21152C">
        {total > 0 ? fmtDh(total) : "0"}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="text-[7px]" fill="#81748A">
        total
      </text>
    </svg>
  );
}
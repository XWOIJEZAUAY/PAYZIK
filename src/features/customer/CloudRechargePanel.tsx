import { useEffect, useState } from "react";
import { Plus, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { fmtDh } from "../../lib/format";
import { getSupabaseClient } from "../../services/auth";
import {
  createGeneralCard,
  listMyCards,
  listShops,
  requestShopCardRecharge,
  listRechargeRequests,
  type PayzikCard,
  type Shop,
  type RechargeRequest,
} from "../../services/backend/payzikCards";

const statusInfo = (s: RechargeRequest["status"]) => {
  if (s === "validated") return { label: "Reçue et validée", color: "text-emerald-600", icon: CheckCircle2 };
  if (s === "rejected") return { label: "Refusée", color: "text-rose-600", icon: XCircle };
  return { label: "En attente du commerçant", color: "text-amber-600", icon: Clock3 };
};

export function CloudRechargePanel({
  customerName,
  onNotice,
}: {
  customerName: string;
  onNotice: (msg: string) => void;
}) {
  const [card, setCard] = useState<PayzikCard | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [amount, setAmount] = useState<number | "">("");
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [cardsRes, shopsRes, reqRes] = await Promise.all([
      listMyCards(),
      listShops(),
      listRechargeRequests("client"),
    ]);
    let c: PayzikCard | null = cardsRes.ok ? (cardsRes.data[0] ?? null) : null;
    if (!c) {
      const created = await createGeneralCard(customerName || "Client PAYZIK");
      if (created.ok) {
        const again = await listMyCards();
        c = again.ok ? (again.data[0] ?? null) : null;
      }
    }
    setCard(c);
    if (!cardsRes.ok) setError(cardsRes.error);
    else setError("");
    if (shopsRes.ok) setShops(shopsRes.data);
    if (reqRes.ok) setRequests(reqRes.data);
    setLoading(false);
  };

  // Realtime : la validation du commerçant apparaît immédiatement chez le client.
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel("client-recharge-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recharge_requests" },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const sendRequest = async () => {
    if (!card || !shopId || typeof amount !== "number" || amount <= 0) return;
    setSending(true);
    setError("");
    const res = await requestShopCardRecharge(shopId, card.id, amount);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    onNotice(`${fmtDh(amount)} envoyés — en attente de validation du commerçant.`);
    setAmount("");
    await refresh();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <p className="text-[12px] text-slate-400">Chargement de la carte PAYZIK…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF7A1A] via-[#FF5200] to-[#C2410C] p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">PAYZIK</p>
            <p className="mt-0.5 text-[11px] text-white/60">Carte prépayée cloud</p>
          </div>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Active</span>
        </div>
        <p className="relative mt-4 font-mono text-[16px] tracking-[0.18em]">{card?.code ?? "—"}</p>
        <div className="relative mt-3 flex items-end justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/60">Titulaire</p>
            <p className="text-[13px] font-semibold">{customerName || "Client PAYZIK"}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-white/60">Solde</p>
            <p className="font-mono text-[18px] font-bold">{fmtDh(card?.balance_dh ?? 0)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <h3 className="text-[13px] font-bold text-[#0F172A]">Recharger chez un commerçant réel</h3>
        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-600">{error}</p>
        )}

        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Commerçant</label>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-[12px] outline-none focus:border-[#FF5200]"
        >
          <option value="">Choisir une boutique…</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.shop_name}{s.verified ? " ✓" : ""}</option>
          ))}
        </select>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`rounded-lg border py-2 font-mono text-[12px] font-bold transition ${
                amount === v
                  ? "border-[#FF5200] bg-[#FFF1EA] text-[#FF5200]"
                  : "border-[#E2E8F0] text-[#0F172A]"
              }`}
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
        <button
          disabled={!card || !shopId || typeof amount !== "number" || amount <= 0 || sending}
          onClick={() => void sendRequest()}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5200] text-[12px] font-bold text-white disabled:opacity-40"
        >
          <Plus size={16} /> {sending ? "Envoi…" : "Demander la recharge"}
        </button>
      </div>

      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
        <p className="text-[12px] font-bold text-[#0F172A]">Mes demandes</p>
        {requests.length === 0 && (
          <p className="mt-2 text-[11px] text-slate-500">Aucune demande pour l’instant.</p>
        )}
        <div className="mt-2 space-y-2">
          {requests.map((r) => {
            const s = statusInfo(r.status);
            const Icon = s.icon;
            return (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-[#F8FAFC] px-3 py-2">
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${s.color}`}>
                  <Icon size={13} /> {s.label}
                </span>
                <span className="font-mono text-[12px] font-bold text-[#0F172A]">{fmtDh(r.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

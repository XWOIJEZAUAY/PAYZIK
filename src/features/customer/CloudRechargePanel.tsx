import { useEffect, useState } from "react";
import { Plus, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { fmtDh } from "../../lib/format";
import { getSupabaseClient } from "../../services/auth";
import {
  listShops,
  requestShopCardRecharge,
  listRechargeRequests,
  type PayzikCard,
  type Shop,
  type RechargeRequest,
} from "../../services/backend/payzikCards";

const statusInfo = (s: RechargeRequest["status"]) => {
  if (s === "validated") return { label: "Validée", color: "text-emerald-600", icon: CheckCircle2 };
  if (s === "rejected") return { label: "Refusée", color: "text-rose-600", icon: XCircle };
  return { label: "En attente", color: "text-amber-600", icon: Clock3 };
};

export function CloudRechargePanel({
  card,
  onNotice,
  onRefresh,
}: {
  card: PayzikCard | null;
  onNotice: (msg: string) => void;
  onRefresh: () => Promise<unknown> | void;
}) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [amount, setAmount] = useState<number | "">("");
  const [shopId, setShopId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refreshRequests = async () => {
    const [s, r] = await Promise.all([listShops(), listRechargeRequests("client")]);
    if (s.ok) setShops(s.data);
    if (r.ok) setRequests(r.data);
  };

  useEffect(() => { void refreshRequests(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel("client-recharge-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recharge_requests" },
        () => { void refreshRequests(); void onRefresh(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRequest = async () => {
    if (!card || !shopId || typeof amount !== "number" || amount <= 0) return;
    setSending(true);
    setError("");
    const res = await requestShopCardRecharge(shopId, card.id, amount);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    onNotice(`${fmtDh(amount)} envoyés — validation en cours.`);
    setAmount("");
    await refreshRequests();
  };

  if (!card) {
    return <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-[11px] text-slate-400">Carte en cours de création…</div>;
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
        <h3 className="text-[12.5px] font-bold text-[#0F172A]">Recharge</h3>
        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10.5px] font-semibold text-rose-600">{error}</p>
        )}
        <label className="mt-2.5 block text-[9px] font-bold uppercase tracking-wider text-[#64748B]">Boutique</label>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="mt-1 h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[11px] outline-none focus:border-[#FF5200]"
        >
          <option value="">Choisir une boutique…</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.shop_name}{s.verified ? " ✓" : ""}</option>
          ))}
        </select>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`rounded-lg border py-1.5 font-mono text-[11px] font-bold transition ${
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
          className="mt-2 h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 font-mono text-[12px] outline-none focus:border-[#FF5200]"
        />
        <button
          disabled={!shopId || typeof amount !== "number" || amount <= 0 || sending}
          onClick={() => void sendRequest()}
          className="mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#FF5200] text-[11px] font-bold text-white disabled:opacity-40"
        >
          <Plus size={14} /> {sending ? "Envoi…" : "Demander la recharge"}
        </button>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
        <p className="text-[11.5px] font-bold text-[#0F172A]">Mes demandes</p>
        {requests.length === 0 && <p className="mt-1.5 text-[10.5px] text-slate-500">Aucune demande.</p>}
        <div className="mt-1.5 space-y-1.5">
          {requests.map((r) => {
            const s = statusInfo(r.status);
            const Icon = s.icon;
            return (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                <span className={`flex items-center gap-1 text-[10.5px] font-semibold ${s.color}`}>
                  <Icon size={12} /> {s.label}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#0F172A]">{fmtDh(r.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

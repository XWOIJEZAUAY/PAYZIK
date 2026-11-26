import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { fmtDh } from "../../lib/format";
import { Button, Card } from "../../components/ui";
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
    setError("");
    const [cardsRes, shopsRes, reqRes] = await Promise.all([
      listMyCards(),
      listShops(),
      listRechargeRequests("client"),
    ]);
    if (!cardsRes.ok) { setError(cardsRes.error); setLoading(false); return; }
    let c: PayzikCard | null = cardsRes.data[0] ?? null;
    if (!c) {
      const created = await createGeneralCard(customerName || "Client PAYZIK");
      if (!created.ok) { setError(created.error); setLoading(false); return; }
      const again = await listMyCards();
      c = again.ok ? (again.data[0] ?? null) : null;
    }
    setCard(c);
    if (shopsRes.ok) setShops(shopsRes.data);
    if (reqRes.ok) setRequests(reqRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRequest = async () => {
    if (!card || !shopId || typeof amount !== "number" || amount <= 0) return;
    setSending(true);
    setError("");
    const res = await requestShopCardRecharge(shopId, card.id, amount);
    setSending(false);
    if (!res.ok) { setError(res.error); return; }
    onNotice(`${fmtDh(amount)} demandés — en attente de validation du commerçant.`);
    setAmount("");
    await refresh();
  };

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-xs text-slate-400">Chargement de la carte PAYZIK…</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="text-[13px] font-extrabold tracking-tight text-ink">Carte PAYZIK (cloud)</h3>
        {card ? (
          <p className="mt-0.5 text-xs text-muted">
            Code : <span className="font-mono font-bold">{card.code}</span> · Solde :{" "}
            <span className="font-bold text-[#FF5200]">{fmtDh(card.balance_dh)}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-red-500">Aucune carte disponible.</p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">{error}</p>
      )}

      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
          Commerçant
        </label>
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          className="h-10 w-full rounded-xl border bg-surface2 px-3 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
        >
          <option value="">Choisir un commerçant…</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shop_name}{s.verified ? " ✓" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {[50, 100, 200, 500].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className={`money rounded-xl border px-4 py-2 text-sm font-bold transition-all ${
              amount === v ? "border-teal bg-accent-soft text-teal-deep" : "bg-surface text-ink hover:border-teal/40"
            }`}
          >
            {v} DH
          </button>
        ))}
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
          placeholder="Autre…"
          className="money h-10 w-28 rounded-xl border bg-surface2 px-3 text-sm font-bold outline-none focus:border-teal focus:ring-2 focus:ring-accent-soft"
        />
      </div>

      <Button
        variant="accent"
        className="w-full !py-3"
        disabled={!card || !shopId || typeof amount !== "number" || amount <= 0 || sending}
        onClick={() => void sendRequest()}
      >
        <Plus size={16} /> {sending ? "Envoi…" : "Demander une recharge"}
      </Button>

      {requests.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Demandes en attente</p>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface2 px-3 py-2 text-[11px]">
              <span className="font-mono">{fmtDh(r.amount)}</span>
              <span className="text-muted">{new Date(r.created_at).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
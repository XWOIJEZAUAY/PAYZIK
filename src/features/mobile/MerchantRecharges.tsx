import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { fmtDh } from "../../lib/format";
import { Pane } from "./ui";
import { getSupabaseClient } from "../../services/auth";
import {
  listRechargeRequests,
  validateShopRechargeRequest,
  rejectShopRechargeRequest,
  getCard,
  listMyShops,
  createShop,
  type RechargeRequest,
  type PayzikCard,
  type Shop,
} from "../../services/backend/payzikCards";

export function MerchantRecharges({ notify }: { notify: (m: string) => void }) {
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [cards, setCards] = useState<Record<string, PayzikCard>>({});
  const [shops, setShops] = useState<Shop[]>([]);
  const [newShopName, setNewShopName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const shopsRes = await listMyShops();
    if (shopsRes.ok) setShops(shopsRes.data);
    const res = await listRechargeRequests("shop");
    if (!res.ok) { setLoading(false); return; }
    setRequests(res.data);
    const cardIds = [...new Set(res.data.map((r) => r.card_id))];
    const entries = await Promise.all(cardIds.map(async (id) => {
      const res = await getCard(id);
      return [id, res.ok ? res.data : null] as const;
    }));
    const map: Record<string, PayzikCard> = {};
    for (const [id, c] of entries) if (c) map[id] = c;
    setCards(map);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel("recharge-requests")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "recharge_requests" },
        () => {
          notify("Nouvelle demande de recharge reçue");
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "recharge_requests" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, []);

  const create = async () => {
    if (!newShopName.trim()) return;
    setCreating(true);
    const res = await createShop(newShopName.trim());
    setCreating(false);
    if (!res.ok) { notify(res.error); return; }
    setNewShopName("");
    notify("Boutique créée.");
    await refresh();
  };

  const validate = async (id: string) => {
    setBusy(id);
    const res = await validateShopRechargeRequest(id);
    setBusy(null);
    if (!res.ok) { notify(res.error); return; }
    notify(`Recharge validée — solde ${fmtDh(res.data.balance_dh)}.`);
    await refresh();
  };

  const reject = async (id: string) => {
    setBusy(id);
    const res = await rejectShopRechargeRequest(id, "refusé par le commerçant");
    setBusy(null);
    if (!res.ok) { notify(res.error); return; }
    notify("Demande refusée.");
    await refresh();
  };

  if (loading) {
    return (
      <div className="p-4 text-xs text-slate-400">Chargement des demandes…</div>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-xs text-slate-400">
          Aucune boutique. Crée ta boutique pour recevoir des demandes de recharge.
        </p>
        <input
          value={newShopName}
          onChange={(e) => setNewShopName(e.target.value)}
          placeholder="Nom de la boutique (ex. Hanout Al Baraka)"
          className="h-10 w-full rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#E91E83]"
        />
        <button
          disabled={creating || !newShopName.trim()}
          onClick={() => void create()}
          className="w-full rounded-xl bg-[#E91E83] py-2.5 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {creating ? "Création…" : "Créer ma boutique"}
        </button>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400">
        Aucune demande de recharge en attente.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {requests.map((r) => {
        const c = cards[r.card_id];
        return (
          <Pane key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-[#21152C]">
                  {c?.name ?? "Carte"} · {c?.code ?? r.card_id}
                </p>
                <p className="text-[10.5px] text-[#81748A]">
                  Client {r.client_id.slice(0, 8)}… · {new Date(r.created_at).toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 font-mono text-[16px] font-bold text-[#E91E83]">
                  {fmtDh(r.amount)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  disabled={busy === r.id}
                  onClick={() => void validate(r.id)}
                  className="flex items-center gap-1 rounded-lg bg-[#059669] px-2.5 py-2 text-[10.5px] font-bold text-white disabled:opacity-40"
                >
                  <Check size={13} /> Valider
                </button>
                <button
                  disabled={busy === r.id}
                  onClick={() => void reject(r.id)}
                  className="flex items-center gap-1 rounded-lg border border-[#E9DDF2] px-2.5 py-2 text-[10.5px] font-bold text-[#DC2626] disabled:opacity-40"
                >
                  <X size={13} /> Refuser
                </button>
              </div>
            </div>
          </Pane>
        );
      })}
    </div>
  );
}
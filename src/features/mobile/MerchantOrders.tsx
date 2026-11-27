/** Commandes de préparation reçues par la boutique (temps réel). */
import { useEffect, useRef, useState } from "react";
import { Check, ClipboardList, Clock3, PackageCheck, X } from "lucide-react";
import { getSupabaseClient } from "../../services/auth";
import { fmtDh } from "../../lib/format";
import { listMyShops, payGeneralCard } from "../../services/backend/payzikCards";
import {
  listShopOrders,
  setOrderStatus,
  type PrepOrder,
} from "../../services/backend/payzikOrders";

const LABEL: Record<PrepOrder["status"], { text: string; cls: string }> = {
  pending: { text: "Nouvelle", cls: "bg-amber-50 text-amber-700" },
  confirmed: { text: "En préparation", cls: "bg-[#E9E6F5] text-[#433874]" },
  ready: { text: "Prête", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { text: "Annulée", cls: "bg-rose-50 text-rose-600" },
};

/** Demande de paiement par solde : montant + carte jointe par le client. */
function cardPayment(note: string | null): { amount: number; cardId: string } | null {
  const m = /^PAIEMENT-SOLDE:([0-9]+(?:[.,][0-9]{1,2})?)(?::([0-9a-fA-F-]{36}))?/.exec(note ?? "");
  if (!m) return null;
  const amount = Number(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, cardId: m[2] ?? "" };
}

export function MerchantOrders({ notify }: { notify: (m: string) => void }) {
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [shopNames, setShopNames] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const refresh = async (ids?: string[]) => {
    const target = ids ?? shopIds;
    const res = await listShopOrders(target);
    if (res.ok) setOrders(res.data);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await listMyShops();
      if (!alive || !res.ok) { setLoading(false); return; }
      const ids = res.data.map((s) => s.id);
      const names: Record<string, string> = {};
      res.data.forEach((s) => { names[s.id] = s.shop_name; });
      setShopIds(ids);
      setShopNames(names);
      await refresh(ids);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel("merchant-prep-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prep_orders" },
        (payload) => {
          const row = payload.new as { shop_id?: string; status?: string };
          if (row?.shop_id && shopIds.includes(row.shop_id)) {
            if (payload.eventType === "INSERT") {
              notifyRef.current("Nouvelle commande.");
            } else if (payload.eventType === "UPDATE" && row.status === "ready") {
              notifyRef.current("Prête.");
            }
          }
          void refresh();
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIds.join(",")]);

  const act = async (
    order: PrepOrder,
    status: "confirmed" | "ready" | "cancelled",
  ) => {
    setBusyId(order.id);
    let paid = false;

    // Confirmer une demande « PAIEMENT-SOLDE » débite réellement la carte.
    const payment = status === "confirmed" ? cardPayment(order.note) : null;
    if (payment) {
      if (!payment.cardId) {
        setBusyId(null);
        notify("Carte absente de la demande.");
        return;
      }
      const pay = await payGeneralCard(
        payment.cardId,
        order.shop_id,
        payment.amount,
        `Commande ${order.id}`,
        `prep-order-${order.id}`,
      );
      if (!pay.ok) {
        setBusyId(null);
        notify("Paiement impossible.");
        return;
      }
      paid = true;
    }

    const res = await setOrderStatus(order.id, status);
    setBusyId(null);
    if (!res.ok) {
      notify(paid ? "Paiement fait. Statut à vérifier." : "Action impossible.");
      await refresh();
      return;
    }
    notify(
      status === "confirmed"
        ? "En préparation."
        : status === "ready"
          ? "Prête."
          : "Annulée.",
    );
    await refresh();
  };

  return (
    <div className="animate-fade-up space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E9E6F5] text-[#433874]">
          <ClipboardList size={18} />
        </span>
        <div>
          <h2 className="text-[14px] font-bold text-[#2E2659]">Commandes à préparer</h2>
          <p className="text-[11px] text-[#6B6389]">Du côté client.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400">Un instant…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#DFD9EF] bg-white p-6 text-center">
          <Clock3 size={22} className="mx-auto text-[#8A6EDD]" />
          <p className="mt-2 text-[12px] font-semibold text-[#2E2659]">Aucune commande pour l’instant</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => {
            const st = LABEL[o.status];
            const payment = cardPayment(o.note);
            const isCardPayment = !!payment;
            const cardAmount = payment?.amount ?? NaN;
            return (
              <div key={o.id} className="rounded-2xl border border-[#DFD9EF] bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-bold text-[#2E2659]">
                    {shopNames[o.shop_id] ?? "Ma boutique"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {isCardPayment && (
                      <span className="rounded-full bg-[#E9E6F5] px-2 py-0.5 text-[9.5px] font-bold text-[#433874]">
                        Paiement solde
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${st.cls}`}>
                      {st.text}
                    </span>
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] font-semibold text-[#2E2659]">
                  {o.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                </p>
                {isCardPayment && Number.isFinite(cardAmount) ? (
                  <p className="mt-1 rounded-lg bg-[#E9E6F5] px-2 py-1 text-[10.5px] font-semibold text-[#433874]">
                    À débiter : {fmtDh(cardAmount)}
                  </p>
                ) : (
                  o.note && (
                    <p className="mt-1 rounded-lg bg-[#F7F5FC] px-2 py-1 text-[10.5px] italic text-[#6B6389]">
                      « {o.note} »
                    </p>
                  )
                )}
                <p className="mt-1 text-[9.5px] text-[#8A7DB0]">
                  {new Date(o.created_at).toLocaleString("fr-MA")}
                </p>

                {o.status === "pending" && (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      disabled={busyId === o.id}
                      onClick={() => void act(o, "confirmed")}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#433874] py-2 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      <Check size={13} /> Confirmer
                    </button>
                    <button
                      disabled={busyId === o.id}
                      onClick={() => void act(o, "cancelled")}
                      className="flex items-center justify-center gap-1 rounded-lg border border-[#DFD9EF] px-3 py-2 text-[11px] font-bold text-[#6B6389] disabled:opacity-40"
                    >
                      <X size={13} /> Refuser
                    </button>
                  </div>
                )}
                {o.status === "confirmed" && (
                  <button
                    disabled={busyId === o.id}
                    onClick={() => void act(o, "ready")}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <PackageCheck size={13} /> Marquer prêt
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

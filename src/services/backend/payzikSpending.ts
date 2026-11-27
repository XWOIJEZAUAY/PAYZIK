/** Suivi réel du portefeuille client, basé sur le ledger Supabase.
 *  Aucune donnée locale ni simulée. */
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "../auth";

export type SpendingTx = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  shopId: string | null;
  createdAt: string;
};

export type SpendingSummary = {
  spentAll: number;
  spentMonth: number;
  toppedAll: number;
  monthCount: number;
  recent: SpendingTx[];
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string; data: SpendingSummary };

const EMPTY: SpendingSummary = {
  spentAll: 0,
  spentMonth: 0,
  toppedAll: 0,
  monthCount: 0,
  recent: [],
};

const SPEND_TYPES = new Set([
  "general_card_payment",
  "shop_card_payment",
  "credit_sale",
]);
const TOP_UP_TYPES = new Set([
  "general_card_recharge",
  "shop_card_recharge",
  "repayment",
  "refund",
]);

export async function getClientSpending(): Promise<Result<SpendingSummary>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré", data: EMPTY };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté", data: EMPTY };

  const { data, error } = await sb
    .from("card_transactions")
    .select("id, transaction_type, amount, description, shop_id, created_at")
    .eq("client_id", u.user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message, data: EMPTY };

  const month = new Date().toISOString().slice(0, 7);
  const rows = (data ?? []) as {
    id: string;
    transaction_type: string;
    amount: number | string;
    description: string | null;
    shop_id: string | null;
    created_at: string;
  }[];

  const list: SpendingTx[] = rows.map((r) => ({
    id: r.id,
    type: r.transaction_type,
    amount: Number(r.amount) || 0,
    description: r.description,
    shopId: r.shop_id,
    createdAt: r.created_at,
  }));

  const spending = list.filter((t) => SPEND_TYPES.has(t.type));
  const summary: SpendingSummary = {
    spentAll: spending.reduce((s, t) => s + t.amount, 0),
    spentMonth: spending
      .filter((t) => t.createdAt.slice(0, 7) === month)
      .reduce((s, t) => s + t.amount, 0),
    toppedAll: list
      .filter((t) => TOP_UP_TYPES.has(t.type))
      .reduce((s, t) => s + t.amount, 0),
    monthCount: spending.filter((t) => t.createdAt.slice(0, 7) === month).length,
    recent: spending.slice(0, 4),
  };
  return { ok: true, data: summary };
}

/** Hook léger pour l'accueil et l'onglet Carte. */
export function useClientSpending() {
  const [summary, setSummary] = useState<SpendingSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getClientSpending();
    setSummary(res.data);
    setLoading(false);
    return res;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, refresh };
}

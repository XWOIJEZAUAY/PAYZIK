/** Commandes de préparation envoyées par l'IA client aux boutiques. */
import { getSupabaseClient } from "../auth";
import { fmtDh } from "../../lib/format";

export type PrepItem = { product_id: string; name: string; qty: number; priceDh?: number };
export type PrepOrder = {
  id: string;
  client_id: string;
  shop_id: string;
  items: PrepItem[];
  note: string | null;
  status: "pending" | "confirmed" | "ready" | "cancelled";
  created_at: string;
  confirmed_at: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createPrepOrder(
  shopId: string,
  items: PrepItem[],
  note?: string | null,
): Promise<Result<{ order_id: string }>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("create_prep_order", {
    p_shop: shopId,
    p_items: items,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; order_id?: string; error?: string };
  if (!r?.ok || !r.order_id) return { ok: false, error: r?.error ?? "Commande impossible" };
  return { ok: true, data: { order_id: r.order_id } };
}

/** Envoie un montant à régler au commerçant (paiement par solde). */
export async function requestCardPayment(
  shopId: string,
  amount: number,
  cardId?: string,
): Promise<Result<{ order_id: string }>> {
  // La carte est jointe à la demande : le commerçant ne peut débiter que ce solde.
  return createPrepOrder(
    shopId,
    [{ product_id: "amount", name: `Montant à régler ${fmtDh(amount)}`, qty: 1, priceDh: amount }],
    `PAIEMENT-SOLDE:${amount}${cardId ? `:${cardId}` : ""}`,
  );
}

export async function listClientOrders(): Promise<Result<PrepOrder[]>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb
    .from("prep_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PrepOrder[] };
}

export async function listShopOrders(shopIds: string[]): Promise<Result<PrepOrder[]>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  if (!shopIds.length) return { ok: true, data: [] };
  const { data, error } = await sb
    .from("prep_orders")
    .select("*")
    .in("shop_id", shopIds)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PrepOrder[] };
}

export async function setOrderStatus(
  orderId: string,
  status: "confirmed" | "ready" | "cancelled",
): Promise<Result<null>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("confirm_prep_order", {
    p_order: orderId,
    p_status: status,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; error?: string };
  if (!r?.ok) return { ok: false, error: r?.error ?? "Action impossible" };
  return { ok: true, data: null };
}

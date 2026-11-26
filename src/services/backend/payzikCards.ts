/** Services Supabase pour les cartes PAYZIK, boutiques et demandes de recharge.
 *  Remplace progressivement le stockage local. */
import { getSupabaseClient } from "../auth";

export type Shop = {
  id: string;
  shop_name: string;
  owner_user_id: string;
  verified: boolean;
  in_network: boolean;
  is_active: boolean;
};

export type PayzikCard = {
  id: string;
  owner_id: string;
  code: string;
  name: string;
  balance_dh: number;
  card_type: "shop" | "general";
  shop_id: string | null;
  status: "active" | "blocked";
};

export type RechargeRequest = {
  id: string;
  client_id: string;
  shop_id: string;
  card_id: string;
  amount: number;
  status: "pending" | "validated" | "rejected";
  created_at: string;
  validated_by: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function client() {
  const sb = getSupabaseClient();
  if (!sb) return null;
  return sb;
}

export async function listShops(): Promise<Result<Shop[]>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb
    .from("shops")
    .select("id, shop_name, owner_user_id, verified, in_network, is_active")
    .eq("is_active", true)
    .order("shop_name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Shop[] };
}

export async function createShop(name: string): Promise<Result<{ shop_id: string }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("create_shop", { p_shop_name: name });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; shop_id?: string; error?: string };
  if (!r?.ok || !r.shop_id) return { ok: false, error: r?.error ?? "Création impossible" };
  return { ok: true, data: { shop_id: r.shop_id } };
}

export async function listMyShops(): Promise<Result<Shop[]>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté" };
  const { data, error } = await sb
    .from("shops")
    .select("id, shop_name, owner_user_id, verified, in_network, is_active")
    .eq("owner_user_id", u.user.id)
    .order("shop_name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Shop[] };
}

export async function createGeneralCard(name: string): Promise<Result<{ card_id: string; code: string; balance_dh: number }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("create_general_card", { p_name: name });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; card_id?: string; code?: string; balance_dh?: number; error?: string };
  if (!r?.ok || !r.card_id || !r.code) return { ok: false, error: r?.error ?? "Création impossible" };
  return { ok: true, data: { card_id: r.card_id, code: r.code, balance_dh: r.balance_dh ?? 0 } };
}

export async function createShopCard(
  shopId: string,
  clientId: string,
  name: string,
  initialDh = 0,
): Promise<Result<{ card_id: string; code: string; balance_dh: number }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("create_shop_card", {
    p_shop: shopId,
    p_client: clientId,
    p_name: name,
    p_initial: initialDh,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; card_id?: string; code?: string; balance_dh?: number; error?: string };
  if (!r?.ok || !r.card_id || !r.code) return { ok: false, error: r?.error ?? "Création impossible" };
  return { ok: true, data: { card_id: r.card_id, code: r.code, balance_dh: r.balance_dh ?? 0 } };
}

export async function getCard(cardId: string): Promise<Result<PayzikCard>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb
    .from("cards")
    .select("id, owner_id, code, name, balance_dh, card_type, shop_id, status")
    .eq("id", cardId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Carte introuvable" };
  return { ok: true, data: data as PayzikCard };
}

export async function listMyCards(): Promise<Result<PayzikCard[]>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté" };
  const { data, error } = await sb
    .from("cards")
    .select("id, owner_id, code, name, balance_dh, card_type, shop_id, status")
    .eq("owner_id", u.user.id)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PayzikCard[] };
}

export async function requestShopCardRecharge(
  shopId: string,
  cardId: string,
  amount: number,
): Promise<Result<{ request_id: string }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("request_shop_card_recharge", {
    p_shop: shopId,
    p_card: cardId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; request_id?: string; error?: string };
  if (!r?.ok || !r.request_id) return { ok: false, error: r?.error ?? "Demande impossible" };
  return { ok: true, data: { request_id: r.request_id } };
}

export async function listRechargeRequests(filter: "client" | "shop"): Promise<Result<RechargeRequest[]>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté" };

  let query = sb
    .from("recharge_requests")
    .select("id, client_id, shop_id, card_id, amount, status, created_at, validated_by, validated_at, rejection_reason")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (filter === "client") {
    query = query.eq("client_id", u.user.id);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as RechargeRequest[] };
}

export async function validateShopRechargeRequest(requestId: string): Promise<Result<{ balance_dh: number }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("validate_shop_recharge_request", { p_request: requestId });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; balance_dh?: number; error?: string };
  if (!r?.ok) return { ok: false, error: r?.error ?? "Validation impossible" };
  return { ok: true, data: { balance_dh: r.balance_dh ?? 0 } };
}

export type CloudProduct = {
  id: string;
  merchant_id: string;
  shop_id: string | null;
  name: string;
  price_dh: number;
  stock: number;
  category: string | null;
  emoji: string | null;
  aliases: string[];
  image: string | null;
};

export async function listCloudProducts(): Promise<Result<CloudProduct[]>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté" };

  const shopsRes = await listMyShops();
  const shopIds = shopsRes.ok ? shopsRes.data.map((s) => s.id) : [];

  let query = sb.from("products").select("*").order("name", { ascending: true });
  if (shopIds.length > 0) {
    query = query.or(`merchant_id.eq.${u.user.id},shop_id.in.(${shopIds.join(",")})`);
  } else {
    query = query.eq("merchant_id", u.user.id);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CloudProduct[] };
}

export async function createCloudProduct(input: {
  name: string;
  priceDh: number;
  stock: number;
  category?: string | null;
  emoji?: string | null;
  aliases?: string[];
  shopId?: string | null;
}): Promise<Result<{ id: string }>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return { ok: false, error: "Non connecté" };

  const { data, error } = await sb
    .from("products")
    .insert({
      merchant_id: u.user.id,
      shop_id: input.shopId ?? null,
      name: input.name,
      price_dh: input.priceDh,
      stock: input.stock,
      category: input.category ?? null,
      emoji: input.emoji ?? null,
      aliases: input.aliases ?? [],
      image: null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateCloudProduct(
  id: string,
  patch: Partial<{
    name: string;
    priceDh: number;
    stock: number;
    category: string | null;
    emoji: string | null;
    aliases: string[];
    shopId: string | null;
  }>,
): Promise<Result<null>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.priceDh !== undefined) payload.price_dh = patch.priceDh;
  if (patch.stock !== undefined) payload.stock = patch.stock;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.emoji !== undefined) payload.emoji = patch.emoji;
  if (patch.aliases !== undefined) payload.aliases = patch.aliases;
  if (patch.shopId !== undefined) payload.shop_id = patch.shopId;

  const { error } = await sb.from("products").update(payload).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function deleteCloudProduct(id: string): Promise<Result<null>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function rejectShopRechargeRequest(requestId: string, reason?: string): Promise<Result<null>> {
  const sb = await client();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("reject_shop_recharge_request", { p_request: requestId, p_reason: reason ?? null });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; error?: string };
  if (!r?.ok) return { ok: false, error: r?.error ?? "Refus impossible" };
  return { ok: true, data: null };
}
/** Offres et promotions réelles publiées par les boutiques PAYZIK. */
import { getSupabaseClient } from "../auth";

export type ShopOffer = {
  id: string;
  shop_id: string;
  title: string;
  description: string | null;
  discount_label: string | null;
  image: string | null;
  is_active: boolean;
  ends_at: string | null;
  created_at: string;
  shop?: {
    shop_name: string;
    city?: string | null;
    address?: string | null;
    image?: string | null;
  } | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listActiveOffers(): Promise<Result<ShopOffer[]>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb
    .from("shop_offers")
    .select("*, shops(shop_name, city, address, image)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ShopOffer[] };
}

export async function createShopOffer(
  shopId: string,
  input: { title: string; description?: string | null; discount?: string | null; image?: string | null; endsAt?: string | null },
): Promise<Result<{ offer_id: string }>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("create_shop_offer", {
    p_shop: shopId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_discount: input.discount ?? null,
    p_image: input.image ?? null,
    p_ends_at: input.endsAt ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; offer_id?: string; error?: string };
  if (!r?.ok || !r.offer_id) return { ok: false, error: r?.error ?? "Création impossible" };
  return { ok: true, data: { offer_id: r.offer_id } };
}

export async function disableShopOffer(offerId: string): Promise<Result<null>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("disable_shop_offer", { p_offer: offerId });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok?: boolean; error?: string };
  if (!r?.ok) return { ok: false, error: r?.error ?? "Action impossible" };
  return { ok: true, data: null };
}

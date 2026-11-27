/** Publication des produits vers PostgreSQL.
 *  Le catalogue local reste synchrone pour la caisse IA ; la publication est
 *  non bloquante et n'altère jamais le rendu ni les animations.
 */
import type { Category, Product } from "../../types";
import { getSupabaseClient } from "../auth";
import { listMyShops } from "./payzikCards";

type CloudRow = {
  id: string;
  name: string;
  price_dh: number | string;
  stock: number;
  category: string | null;
  emoji: string | null;
  aliases: string[] | null;
  image: string | null;
};

function isAuthUserId(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(userId);
}

/** L'ID local reste court ; l'ID cloud est namespacé par utilisateur. */
export function cloudProductId(userId: string, localId: string): string {
  return `${userId.replace(/-/g, "").slice(0, 10)}-${localId}`;
}

function toLocalId(userId: string, cloudId: string): string {
  const prefix = cloudProductId(userId, "");
  return cloudId.startsWith(prefix) ? cloudId.slice(prefix.length) : cloudId;
}

let primaryShop: Promise<string | null> | null = null;

export function resetPrimaryShopCache(): void {
  primaryShop = null;
}

async function getPrimaryShopId(): Promise<string | null> {
  if (!primaryShop) {
    primaryShop = listMyShops()
      .then((res) => {
        if (!res.ok) return null;
        return res.data.find((s) => s.is_active)?.id ?? res.data[0]?.id ?? null;
      })
      .catch(() => null);
  }
  return primaryShop;
}

export async function fetchMyPublishedProducts(
  userId: string,
): Promise<{ ok: boolean; data: Product[]; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb || !isAuthUserId(userId)) return { ok: true, data: [] };
  const { data, error } = await sb
    .from("products")
    .select("id, name, price_dh, stock, category, emoji, aliases, image")
    .eq("merchant_id", userId)
    .order("name", { ascending: true });
  if (error) {
    console.error("PAYZIK — lecture du catalogue PostgreSQL impossible :", error.message);
    return { ok: false, data: [], error: error.message };
  }
  const products: Product[] = (data ?? []).map((raw) => {
    const row = raw as CloudRow;
    return {
      id: toLocalId(userId, row.id),
      name: row.name,
      priceDh: Number(row.price_dh),
      stock: Number(row.stock),
      category: (row.category as Category) ?? "Épicerie",
      emoji: row.emoji ?? "📦",
      aliases: row.aliases ?? [],
      image: row.image ?? undefined,
    };
  });
  return { ok: true, data: products };
}

/** Upsert idempotent : même ID local => même ligne PostgreSQL. */
export async function publishProduct(userId: string, product: Product): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || !isAuthUserId(userId)) return false;
  const shopId = await getPrimaryShopId();
  if (!shopId) {
    console.warn("PAYZIK — produit non publié : aucune boutique active pour ce marchand.");
    return false;
  }
  const { error } = await sb.rpc("upsert_shop_product", {
    p_id: cloudProductId(userId, product.id),
    p_shop: shopId,
    p_name: product.name,
    p_price: Number(product.priceDh),
    p_stock: Math.max(0, Math.trunc(product.stock)),
    p_category: product.category ?? null,
    p_emoji: product.emoji ?? null,
    p_aliases: product.aliases ?? [],
    p_image: product.image ?? null,
  });
  if (error) {
    console.error("PAYZIK — publication produit impossible :", error.message);
    return false;
  }
  return true;
}

export async function deletePublishedProduct(userId: string, productId: string): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || !isAuthUserId(userId)) return false;
  const { error } = await sb.rpc("delete_shop_product", {
    p_id: cloudProductId(userId, productId),
  });
  if (error) {
    console.error("PAYZIK — retrait du produit publié impossible :", error.message);
    return false;
  }
  return true;
}

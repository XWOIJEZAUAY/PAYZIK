/** Annonces réelles de partenaires, diffusées uniquement si actives et datées. */
import { getSupabaseClient } from "../auth";

export type PartnerAd = {
  id: string;
  company_name: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string;
  cta_url: string | null;
  placement: "home" | "shops" | "catalog";
  weight: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listPartnerAds(
  placement: PartnerAd["placement"],
): Promise<Result<PartnerAd[]>> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb
    .from("partner_ads")
    .select("*")
    .eq("is_active", true)
    .eq("placement", placement)
    .order("weight", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PartnerAd[] };
}

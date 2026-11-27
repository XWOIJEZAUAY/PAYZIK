/** PAYZIK — Gestion des offres réelles de la boutique. */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { listMyShops } from "../../services/backend/payzikCards";
import {
  createShopOffer,
  disableShopOffer,
  listActiveOffers,
  type ShopOffer,
} from "../../services/backend/payzikOffers";

export function MerchantOffers({ notify }: { notify: (m: string) => void }) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [offers, setOffers] = useState<ShopOffer[]>([]);
  const [title, setTitle] = useState("");
  const [discount, setDiscount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const myShops = await listMyShops();
    if (!myShops.ok || !myShops.data.length) return;
    const id = myShops.data[0].id;
    setShopId(id);
    const res = await listActiveOffers();
    if (res.ok) setOffers(res.data.filter((o) => o.shop_id === id));
  };

  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!shopId || !title.trim()) {
      notify("Renseigne le titre de l'offre");
      return;
    }
    setBusy(true);
    const res = await createShopOffer(shopId, {
      title: title.trim(),
      discount: discount.trim() || null,
      description: description.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      notify(res.error);
      return;
    }
    setTitle(""); setDiscount(""); setDescription("");
    notify("Offre publiée, visible par les clients");
    void load();
  };

  const remove = async (id: string) => {
    const res = await disableShopOffer(id);
    if (!res.ok) notify(res.error);
    else { notify("Offre retirée"); void load(); }
  };

  return (
    <div className="space-y-3 pb-4">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#FF7A1A]">Publier une offre</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex : −20% sur les courses"
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none focus:border-[#FF7A1A]"
        />
        <input
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="Réduction (ex : −20%)"
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none focus:border-[#FF7A1A]"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optionnel)"
          rows={2}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#FF7A1A]"
        />
        <button
          onClick={() => void add()}
          disabled={busy}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#FF7A1A] text-[12px] font-bold text-white disabled:opacity-50"
        >
          <Plus size={15} /> {busy ? "Publication…" : "Publier l'offre"}
        </button>
      </section>

      <section className="space-y-2">
        <p className="px-1 text-[12px] font-bold text-slate-700">Mes offres actives ({offers.length})</p>
        {offers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-[12px] text-slate-500">
            Aucune offre publiée.
          </div>
        )}
        {offers.map((o) => (
          <div key={o.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-slate-900">{o.title}</p>
              <p className="text-[11px] text-slate-500">{o.discount_label || o.description || "Offre boutique"}</p>
            </div>
            <button onClick={() => void remove(o.id)} className="rounded-xl p-2 text-rose-500 hover:bg-rose-50">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

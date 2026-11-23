import { Check, Images, Plus, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import type { Category, Product } from "../../types";
import { Button, Modal, StockBadge, cn } from "../../components/ui";
import { searchProductImage, resizeImageFile } from "../../services/imageSearch";

const CATEGORIES: ("Tous" | Category)[] = ["Tous", "Boissons", "Épicerie", "Hygiène", "Frais"];

export function CatalogueView({ store }: { store: Store }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Tous");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Product | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [imgSearching, setImgSearching] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const triedRef = useRef<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.products.filter(
      (p) =>
        (cat === "Tous" || p.category === cat) &&
        (!q || p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.includes(q))),
    );
  }, [store.products, cat, query]);

  // Recherche automatique d'image pour les produits sans photo (Open Food Facts).
  useEffect(() => {
    const missing = store.products.filter(
      (p) => !p.image && !triedRef.current.has(p.id),
    );
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const p of missing) {
        if (cancelled) return;
        triedRef.current.add(p.id);
        try {
          const res = await searchProductImage(p.name);
          if (cancelled) return;
          if (res?.url) store.updateProduct(p.id, { image: res.url });
        } catch {
          /* réseau : on réessaiera au prochain montage */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store.products]);

  const add = (p: Product) => {
    store.addToCart(p.id);
    setJustAdded(p.id);
    window.setTimeout(() => setJustAdded((id) => (id === p.id ? null : id)), 900);
  };

  const searchImg = async (p: Product) => {
    setImgError(null);
    setImgSearching(true);
    try {
      const res = await searchProductImage(p.name);
      if (res?.url) {
        store.updateProduct(p.id, { image: res.url });
        setActive({ ...p, image: res.url });
      } else {
        setImgError("Aucune image trouvée sur Open Food Facts");
      }
    } catch {
      setImgError("Erreur réseau — réessaie");
    } finally {
      setImgSearching(false);
    }
  };

  const capturePhoto = async (p: Product, file: File) => {
    setImgError(null);
    setImgSearching(true);
    try {
      const dataUrl = await resizeImageFile(file, 300);
      store.updateProduct(p.id, { image: dataUrl });
      setActive({ ...p, image: dataUrl });
    } catch {
      setImgError("Impossible de lire la photo");
    } finally {
      setImgSearching(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      {/* en-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-ink">
            <Images size={18} className="text-brand" /> Catalogue
          </h2>
          <p className="text-sm text-slate-400">{visible.length} produit(s) · visuel grand format</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit…"
            className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
      </div>

      {/* filtres */}
      <div className="flex gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
              cat === c
                ? "bg-ink text-white shadow-sm"
                : "border bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* galerie : images en grand */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {visible.map((p) => {
          const inCart = store.cart.find((l) => l.productId === p.id)?.qty ?? 0;
          const added = justAdded === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActive(p)}
              className="group relative overflow-hidden rounded-3xl border bg-white text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-pop active:scale-[.98]"
            >
              {/* image grand format */}
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-slate-50">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-7xl opacity-80">
                    {p.emoji}
                  </span>
                )}

                <span className="absolute right-2.5 top-2.5">
                  <StockBadge stock={p.stock} />
                </span>

                {inCart > 0 && (
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                    <ShoppingCart size={11} /> {inCart}
                  </span>
                )}

                {p.stock === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/55 text-xs font-black uppercase tracking-wider text-rose-600 backdrop-blur-[1px]">
                    Rupture
                  </span>
                )}

                {/* légende sur l'image */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 pt-8 text-white">
                  <p className="line-clamp-1 text-sm font-bold leading-tight">{p.name}</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/70">{p.category}</span>
                    <span className="tnum text-base font-black">{fmtDh(p.priceDh)}</span>
                  </div>
                </div>
              </div>

              {/* bouton rapide au survol */}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.stock > 0) add(p);
                }}
                className={cn(
                  "pointer-events-none absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white opacity-0 shadow-lg transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
                  added ? "bg-emerald-600" : "bg-brand",
                )}
              >
                {added ? (
                  <>
                    <Check size={14} /> Ajouté
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Ajouter au ticket
                  </>
                )}
              </span>
            </button>
          );
        })}

        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-slate-400">
            Aucun produit ne correspond.
          </p>
        )}
      </div>

      {/* fiche produit */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name ?? ""} wide>
        {active && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-200/60">
              {active.image ? (
                <img src={active.image} alt={active.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-8xl">
                  {active.emoji}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {active.category}
                </p>
                <p className="tnum mt-1 text-3xl font-black text-ink">{fmtDh(active.priceDh)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StockBadge stock={active.stock} />
                {store.cart.find((l) => l.productId === active.id) && (
                  <span className="text-xs font-semibold text-brand">
                    {store.cart.find((l) => l.productId === active.id)?.qty} au ticket
                  </span>
                )}
              </div>
              {active.aliases.length > 0 && (
                <p className="text-xs text-slate-400">
                  Aussi : {active.aliases.join(", ")}
                </p>
              )}
              <Button
                variant="secondary"
                className="w-full"
                disabled={imgSearching}
                onClick={() => searchImg(active)}
              >
                {imgSearching ? "Recherche…" : "🔍 Chercher sur Open Food Facts"}
              </Button>
              <label className="block">
                <span
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50",
                    imgSearching && "pointer-events-none opacity-50",
                  )}
                >
                  📷 Prendre / importer une photo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={imgSearching}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && active) capturePhoto(active, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {imgError && <p className="text-xs text-rose-500">{imgError}</p>}
              <Button
                variant="primary"
                className="mt-auto w-full"
                disabled={active.stock === 0}
                onClick={() => {
                  add(active);
                  setActive(null);
                }}
              >
                <Plus size={15} /> Ajouter au ticket
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

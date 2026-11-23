import {
  AlertTriangle,
  Check,
  Images,
  PackageX,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import type { Category, Product } from "../../types";
import { Button, Modal, StockBadge, cn } from "../../components/ui";
import { searchProductImage, resizeImageFile } from "../../services/imageSearch";
import { ScannerModal } from "../voice/ScannerModal";

const CATEGORIES: ("Tous" | Category)[] = ["Tous", "Boissons", "Épicerie", "Hygiène", "Frais"];

const CAT_ICON: Record<(typeof CATEGORIES)[number], string> = {
  Tous: "✦",
  Boissons: "🥤",
  Épicerie: "🛒",
  Hygiène: "🧴",
  Frais: "🥬",
};

type Draft = {
  name: string;
  priceDh: string;
  stock: string;
  category: Category;
  emoji: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  priceDh: "",
  stock: "",
  category: "Boissons",
  emoji: "📦",
};

export function CatalogueView({ store }: { store: Store }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Tous");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Product | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [imgSearching, setImgSearching] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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

  const createProduct = () => {
    const name = draft.name.trim();
    const price = Number(draft.priceDh);
    if (!name || !Number.isFinite(price) || price <= 0) return;
    store.addProduct({
      name,
      priceDh: price,
      stock: Math.max(0, Math.floor(Number(draft.stock) || 0)),
      category: draft.category,
      emoji: draft.emoji.trim() || "📦",
      aliases: [],
    });
    setDraft(EMPTY_DRAFT);
    setAdding(false);
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
    <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-5 sm:px-6">
      {/* En-tête de page */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange/12 text-orange-deep">
              <Images size={19} />
            </span>
            <h2 className="truncate text-[28px] font-black leading-none tracking-tight text-ink sm:text-[32px]">
              Catalogue
            </h2>
          </div>
          <p className="mt-2 text-[13px] font-medium text-muted">
            Gérez vos produits en toute simplicité
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-orange/12 px-3 py-1.5 text-[11px] font-black text-orange-deep">
          {visible.length} produits
        </span>
      </div>

      {/* Recherche pleine largeur */}
      <div className="relative mt-5">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit…"
          className="h-12 w-full rounded-2xl border border-ink/10 bg-surface2/70 pl-11 pr-4 text-sm font-medium text-ink outline-none transition-colors placeholder:text-muted focus:border-orange/60 focus:bg-surface focus:ring-2 focus:ring-orange/15"
        />
      </div>

      {/* Catégories */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all",
              cat === c
                ? "bg-orange text-cream shadow-glow"
                : "bg-surface2/70 text-ink/75 hover:bg-orange/12 hover:text-orange-deep",
            )}
          >
            <span className="text-[14px] leading-none">{CAT_ICON[c]}</span>
            {c}
          </button>
        ))}
      </div>

      {/* Grille produits — 2 colonnes sur mobile */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => {
          const inCart = store.cart.find((l) => l.productId === p.id)?.qty ?? 0;
          const added = justAdded === p.id;
          return (
            <div
              key={p.id}
              className="group overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-pop"
            >
              <button
                onClick={() => setActive(p)}
                className="block w-full text-left"
                aria-label={`Voir ${p.name}`}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-6xl opacity-90">
                      {p.emoji}
                    </span>
                  )}

                  <span className="absolute right-2 top-2">
                    <StockBadge stock={p.stock} />
                  </span>

                  {inCart > 0 && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-orange px-2 py-0.5 text-[10px] font-black text-cream shadow-sm">
                      <ShoppingCart size={10} /> {inCart}
                    </span>
                  )}

                  {p.stock === 0 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-cream/60 text-[11px] font-black uppercase tracking-wider text-rose-600 backdrop-blur-[1px]">
                      Rupture
                    </span>
                  )}
                </div>
              </button>

              <div className="p-3">
                <p className="truncate text-[14px] font-bold leading-tight text-ink">{p.name}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="tnum text-[17px] font-black text-orange-deep">
                    {fmtDh(p.priceDh)}
                  </span>
                  <button
                    onClick={() => add(p)}
                    disabled={p.stock === 0}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                      added ? "bg-gold text-night" : "bg-orange text-cream hover:bg-orange-deep",
                      p.stock === 0 && "opacity-40",
                    )}
                    aria-label={`Ajouter ${p.name} au ticket`}
                  >
                    {added ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                </div>
                <p
                  className={cn(
                    "mt-1.5 flex items-center gap-1 text-[11px] font-semibold",
                    p.stock === 0
                      ? "text-rose-600"
                      : p.stock <= 10
                        ? "text-orange-deep"
                        : "text-muted",
                  )}
                >
                  {p.stock === 0 ? (
                    <PackageX size={12} />
                  ) : p.stock <= 10 ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Check size={12} />
                  )}
                  {p.stock === 0
                    ? "Rupture"
                    : p.stock <= 10
                      ? `Stock faible : ${p.stock}`
                      : `En stock : ${p.stock}`}
                </p>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm font-semibold text-muted">
            Aucun produit ne correspond.
          </p>
        )}
      </div>

      {/* Actions bas de page */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)_+_4.5rem)] mt-4 grid grid-cols-2 gap-3 lg:static">
        <button
          onClick={() => setAdding(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-orange text-[13px] font-black text-cream shadow-glow transition-colors hover:bg-orange-deep"
        >
          <Plus size={17} /> Ajouter un produit
        </button>
        <button
          onClick={() => setScannerOpen(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-orange/12 text-[13px] font-black text-orange-deep transition-colors hover:bg-orange/20"
        >
          <ScanBarcode size={17} /> Scanner code-barres
        </button>
      </div>

      {/* Fiche produit / image */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name ?? ""} wide>
        {active && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-sand ring-1 ring-inset ring-ink/10">
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
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  {active.category}
                </p>
                <p className="tnum mt-1 text-3xl font-black text-orange-deep">
                  {fmtDh(active.priceDh)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StockBadge stock={active.stock} />
                {store.cart.find((l) => l.productId === active.id) && (
                  <span className="text-xs font-semibold text-orange-deep">
                    {store.cart.find((l) => l.productId === active.id)?.qty} au ticket
                  </span>
                )}
              </div>
              {active.aliases.length > 0 && (
                <p className="text-xs text-muted">Aussi : {active.aliases.join(", ")}</p>
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
                    "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-orange/10",
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
              {imgError && <p className="text-xs text-rose-600">{imgError}</p>}
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

      {/* Création rapide d'un produit */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Nouveau produit">
        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted">Nom du produit</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ex. Lait UHT 1L"
              className="h-11 w-full rounded-xl border border-ink/10 bg-surface2/60 px-3 text-sm outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">Prix (DH)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={draft.priceDh}
                onChange={(e) => setDraft({ ...draft, priceDh: e.target.value })}
                className="tnum h-11 w-full rounded-xl border border-ink/10 bg-surface2/60 px-3 text-sm outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">Stock</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.stock}
                onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                className="tnum h-11 w-full rounded-xl border border-ink/10 bg-surface2/60 px-3 text-sm outline-none focus:border-orange/60 focus:ring-2 focus:ring-orange/15"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">Catégorie</span>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
                className="h-11 w-full rounded-xl border border-ink/10 bg-surface2/60 px-3 text-sm outline-none focus:border-orange/60"
              >
                {CATEGORIES.filter((c) => c !== "Tous").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-muted">Emoji</span>
              <input
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="h-11 w-full rounded-xl border border-ink/10 bg-surface2/60 px-3 text-center text-lg outline-none focus:border-orange/60"
              />
            </label>
          </div>
          <Button
            variant="primary"
            className="mt-1 w-full"
            disabled={!draft.name.trim() || Number(draft.priceDh) <= 0}
            onClick={createProduct}
          >
            <Plus size={15} /> Créer le produit
          </Button>
        </div>
      </Modal>

      <ScannerModal store={store} open={scannerOpen} onClose={() => setScannerOpen(false)} />
    </div>
  );
}

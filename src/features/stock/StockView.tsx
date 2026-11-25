import { ImagePlus, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { fileToThumbnail } from "../../lib/image";
import { fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import type { Category, Product } from "../../types";
import { Button, Card, Modal, StockBadge, cn } from "../../components/ui";

const CATEGORIES: Category[] = ["Boissons", "Épicerie", "Hygiène", "Frais"];

/** Vignette produit : photo si choisie, sinon emoji. */
export function ProductThumb({
  product,
  size = "md",
}: {
  product: Product;
  size?: "sm" | "md" | "lg";
}) {
  const box = {
    sm: "h-9 w-9 text-lg rounded-lg",
    md: "h-10 w-10 text-xl rounded-xl",
    lg: "h-20 w-20 text-4xl rounded-2xl",
  }[size];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-slate-50 ring-1 ring-inset ring-slate-200/60",
        box,
      )}
    >
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full rounded-[inherit] object-cover"
        />
      ) : (
        product.emoji
      )}
    </span>
  );
}

/* ------------------------- Éditeur de produit ------------------------- */
function ProductEditor({
  store,
  product,
  onClose,
}: {
  store: Store;
  product: Product | null; // null = nouveau produit
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(String(product?.priceDh ?? ""));
  const [stock, setStock] = useState(String(product?.stock ?? "0"));
  const [category, setCategory] = useState<Category>(product?.category ?? "Épicerie");
  const [emoji, setEmoji] = useState(product?.emoji ?? "🧺");
  const [aliases, setAliases] = useState((product?.aliases ?? []).join(", "));
  const [image, setImage] = useState<string | undefined>(product?.image);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      setImage(await fileToThumbnail(file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Image invalide");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const priceDh = Math.max(0, Number(price.replace(",", ".")) || 0);
    if (!name.trim()) {
      setErr("Donne un nom au produit");
      return;
    }
    const data = {
      name: name.trim(),
      priceDh,
      stock: Math.max(0, Math.round(Number(stock) || 0)),
      category,
      emoji: emoji.trim() || "🧺",
      aliases: aliases
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
      image,
    };
    if (product) store.updateProduct(product.id, data);
    else store.addProduct(data);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Modifier « ${product.name} »` : "Nouveau produit"}
    >
      <div className="space-y-4">
        {/* choix de l'image */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-brand"
          >
            {image ? (
              <>
                <img src={image} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                  Changer la photo
                </span>
              </>
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
                <ImagePlus size={22} />
                <span className="text-[10px] font-semibold">Choisir une image</span>
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">Photo du produit</p>
            <p className="mt-0.5 text-xs text-slate-400">
              JPG ou PNG depuis ton appareil — réduite automatiquement.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={13} /> {image ? "Remplacer" : "Parcourir…"}
              </Button>
              {image && (
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => setImage(undefined)}
                >
                  <X size={13} /> Retirer
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* champs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. : Sidi Ali 1.5L"
              className="mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-500">Prix (DH)</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="6"
              className="tnum mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-500">Stock</span>
            <input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-500">Catégorie</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold text-slate-500">Emoji (repli)</span>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🧺"
              className="mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-center text-lg outline-none focus:border-brand focus:bg-white"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">
              Mots-clés vocaux (séparés par des virgules)
            </span>
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="sidi ali, lma, eau"
              className="mt-1 h-10 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
          </label>
        </div>

        {err && <p className="text-sm font-medium text-rose-600">{err}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {product ? (
            <Button
              variant="danger"
              className="!px-3"
              onClick={() => {
                store.removeProduct(product.id);
                onClose();
              }}
            >
              <Trash2 size={14} /> Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" disabled={busy} onClick={save}>
              {product ? "Enregistrer" : "Créer le produit"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ Vue stock ----------------------------- */
export function StockView({ store }: { store: Store }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">Stock & Inventaire</h2>
          <p className="text-sm text-slate-400">
            {store.products.length} références · clique un produit pour changer sa photo et ses infos
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Nouveau produit
        </Button>
      </div>

      <Card className="divide-y overflow-hidden">
        {store.products.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
            <button
              onClick={() => setEditing(p)}
              className="transition hover:opacity-80"
              title="Changer la photo"
            >
              <ProductThumb product={p} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{p.name}</p>
              <p className="tnum text-xs text-slate-400">
                {fmtDh(p.priceDh)} · {p.category}
                {p.image ? " · 📷" : ""}
              </p>
            </div>
            <StockBadge stock={p.stock} />
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                className="!h-8 !w-8 !p-0"
                onClick={() => store.adjustStock(p.id, -1)}
              >
                <Minus size={14} />
              </Button>
              <span className="tnum w-10 text-center text-sm font-black text-ink">
                {p.stock}
              </span>
              <Button
                variant="secondary"
                className="!h-8 !w-8 !p-0"
                onClick={() => store.adjustStock(p.id, +1)}
              >
                <Plus size={14} />
              </Button>
              <Button
                variant="ghost"
                className="!px-2.5 !py-1.5 text-xs"
                onClick={() => store.adjustStock(p.id, +12)}
              >
                +12
              </Button>
              <Button
                variant="ghost"
                className="!px-2 !py-1.5"
                title="Modifier (photo, prix…)"
                onClick={() => setEditing(p)}
              >
                <Pencil size={14} />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {(editing || creating) && (
        <ProductEditor
          store={store}
          product={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

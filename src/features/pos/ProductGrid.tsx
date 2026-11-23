import { useMemo, useState } from "react";
import { fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import type { Category } from "../../types";
import { cn, StockBadge } from "../../components/ui";

const CATEGORIES: ("Tous" | Category)[] = ["Tous", "Boissons", "Épicerie", "Hygiène", "Frais"];

export function ProductGrid({ store, search }: { store: Store; search: string }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Tous");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return store.products.filter(
      (p) =>
        (cat === "Tous" || p.category === cat) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.aliases.some((a) => a.includes(q))),
    );
  }, [store.products, cat, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* filtres catégories */}
      <div className="flex gap-1.5 py-3">
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

      {/* grille produits */}
      <div className="scrollbar-thin grid flex-1 content-start gap-3 overflow-y-auto pb-4 pr-1 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {visible.map((p) => (
          <button
            key={p.id}
            disabled={p.stock === 0}
            onClick={() => store.addToCart(p.id)}
            className={cn(
              "group relative flex flex-col gap-2 rounded-2xl border bg-white p-3.5 text-left shadow-card transition-all duration-150",
              p.stock === 0
                ? "opacity-55 grayscale"
                : "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop active:scale-[.97]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              {p.image ? (
                <div className="relative -mx-0.5 w-full overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200/60">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-20 w-full object-cover"
                  />
                  <span className="absolute right-1 top-1">
                    <StockBadge stock={p.stock} />
                  </span>
                </div>
              ) : (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-2xl ring-1 ring-inset ring-slate-200/60">
                    {p.emoji}
                  </span>
                  <StockBadge stock={p.stock} />
                </>
              )}
            </div>
            <div>
              <p className="text-[13px] font-bold leading-tight text-ink">{p.name}</p>
              <p className="text-[11px] text-slate-400">{p.category}</p>
            </div>
            <p className="tnum text-base font-extrabold text-ink">
              {fmtDh(p.priceDh)}
            </p>
            {p.stock > 0 && (
              <span className="pointer-events-none absolute inset-x-3 bottom-2 translate-y-1 rounded-lg bg-brand py-1 text-center text-[11px] font-bold text-white opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                + Ajouter au ticket
              </span>
            )}
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            Aucun produit ne correspond à « {search} »
          </p>
        )}
      </div>
    </div>
  );
}

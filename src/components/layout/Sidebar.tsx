import {
  BarChart3,
  BookOpen,
  CreditCard,
  Images,
  Mic,
  Package,
  Settings,
} from "lucide-react";
import type { View } from "../../types";
import { cn } from "../ui";

const ITEMS: { view: View; label: string; icon: typeof Mic }[] = [
  { view: "pos", label: "Caisse & Vente", icon: Mic },
  { view: "catalogue", label: "Catalogue", icon: Images },
  { view: "cards", label: "Cartes PAYZIK", icon: CreditCard },
  { view: "kridi", label: "Carnet Kridi", icon: BookOpen },
  { view: "stock", label: "Stock & Inventaire", icon: Package },
  { view: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { view: "settings", label: "Paramètres", icon: Settings },
];

export function Sidebar({
  view,
  onChange,
  kridiBadge,
}: {
  view: View;
  onChange: (v: View) => void;
  kridiBadge?: number;
}) {
  return (
    <nav className="flex w-[220px] shrink-0 flex-col gap-1 bg-sand p-3 border-r border-line">
      <div className="mb-3 flex items-center gap-2.5 px-1 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange text-white font-black text-sm">
          P
        </span>
        <span className="text-lg font-black tracking-tight text-ink">PAYZIK</span>
      </div>

      {ITEMS.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all duration-150",
            view === v
              ? "bg-orange-soft text-orange-deep"
              : "text-muted hover:bg-sand hover:text-ink",
          )}
        >
          <Icon
            size={17}
            className={cn(
              "transition-colors",
              view === v ? "text-orange" : "text-subtle group-hover:text-muted",
            )}
          />
          {label}
          {v === "kridi" && (kridiBadge ?? 0) > 0 && (
            <span className="ml-auto rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning">
              {kridiBadge}
            </span>
          )}
          {view === v && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-orange" />
          )}
        </button>
      ))}

      <div className="mt-auto pt-3">
        <div className="px-1 text-[11px] leading-relaxed text-subtle">
          v1.0 · Données locales
        </div>
      </div>
    </nav>
  );
}
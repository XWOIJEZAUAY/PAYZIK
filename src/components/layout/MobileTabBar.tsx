import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Images,
  Mic,
  MoreHorizontal,
  Package,
  Settings,
} from "lucide-react";
import type { View } from "../../types";
import { cn } from "../ui";

const MAIN: { view: View; label: string; icon: typeof Mic }[] = [
  { view: "pos", label: "Caisse", icon: Mic },
  { view: "catalogue", label: "Catalogue", icon: Images },
  { view: "cards", label: "Cartes", icon: CreditCard },
  { view: "kridi", label: "Kridi", icon: BookOpen },
];

const MORE: { view: View; label: string; icon: typeof Mic }[] = [
  { view: "stock", label: "Stock", icon: Package },
  { view: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { view: "settings", label: "Paramètres", icon: Settings },
];

/** Barre d'onglets basse, affichée seulement sur téléphone (< lg). */
export function MobileTabBar({
  view,
  onChange,
  kridiBadge = 0,
}: {
  view: View;
  onChange: (v: View) => void;
  kridiBadge?: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const extraActive = MORE.some((item) => item.view === view);

  const go = (v: View) => {
    setMoreOpen(false);
    onChange(v);
  };

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}

      {moreOpen && (
        <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)_+_4rem)] z-50 rounded-2xl border border-white/10 bg-night-soft p-2 shadow-2xl lg:hidden">
          {MORE.map(({ view: v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => go(v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold",
                view === v ? "bg-white/10 text-teal" : "text-slate-300",
              )}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MAIN.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => go(v)}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
              view === v ? "text-teal" : "text-slate-400",
            )}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={view === v ? 2.4 : 1.9} />
              {v === "kridi" && kridiBadge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 rounded-full bg-amber-500 px-1.5 text-[9px] font-black text-[#251500]">
                  {kridiBadge}
                </span>
              )}
            </span>
            {label}
            {view === v && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-teal" />}
          </button>
        ))}

        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn(
            "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
            extraActive ? "text-teal" : "text-slate-400",
          )}
        >
          <MoreHorizontal size={21} strokeWidth={extraActive ? 2.4 : 1.9} />
          Plus
          {extraActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-teal" />}
        </button>
      </nav>
    </>
  );
}

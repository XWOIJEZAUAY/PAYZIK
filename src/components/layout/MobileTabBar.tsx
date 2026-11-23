import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Home,
  Images,
  MoreHorizontal,
  Package,
  Settings,
} from "lucide-react";
import type { View } from "../../types";
import { cn } from "../ui";

const MAIN: { view: View; label: string; icon: typeof Home }[] = [
  { view: "pos", label: "Accueil", icon: Home },
  { view: "catalogue", label: "Catalogue", icon: Images },
  { view: "kridi", label: "Kridi", icon: BookOpen },
];

const MORE: { view: View; label: string; icon: typeof Home }[] = [
  { view: "cards", label: "Cartes", icon: CreditCard },
  { view: "stock", label: "Stock", icon: Package },
  { view: "dashboard", label: "Tableau de bord", icon: BarChart3 },
  { view: "settings", label: "Paramètres", icon: Settings },
];

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
          className="fixed inset-0 z-40 bg-night/30 lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}

      {moreOpen && (
        <div className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)_+_4rem)] z-50 rounded-2xl border border-ink/10 bg-cream p-2 shadow-pop lg:hidden">
          {MORE.map(({ view: v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => go(v)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold",
                view === v
                  ? "bg-orange/10 text-orange-deep"
                  : "text-muted hover:bg-sand/70 hover:text-ink",
              )}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-ink/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MAIN.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => go(v)}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
              view === v ? "text-orange-deep" : "text-muted",
            )}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={view === v ? 2.4 : 1.9} />
              {v === "kridi" && kridiBadge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 rounded-full bg-gold px-1.5 text-[9px] font-black text-night">
                  {kridiBadge}
                </span>
              )}
            </span>
            {label}
            {view === v && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-orange" />}
          </button>
        ))}

        <button
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn(
            "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
            extraActive ? "text-orange-deep" : "text-muted",
          )}
        >
          <MoreHorizontal size={21} strokeWidth={extraActive ? 2.4 : 1.9} />
          Menu
          {extraActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-orange" />}
        </button>
      </nav>
    </>
  );
}

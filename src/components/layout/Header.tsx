import { ArrowLeftRight, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Store as StoreType } from "../../state/store";
import { BoltIcon } from "../brand/Logo";

export function Header({
  store: _store,
  search,
  onSearch,
  onOpenAlerts: _onOpenAlerts,
  hideSearch,
  onSwitchProfile,
}: {
  store: StoreType;
  search: string;
  onSearch: (v: string) => void;
  onOpenAlerts: () => void;
  hideSearch?: boolean;
  onSwitchProfile?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/10 bg-cream/95 px-3 py-2.5 backdrop-blur sm:gap-6 sm:px-5 lg:h-20 lg:flex-nowrap lg:py-0">
      <div className="flex items-center gap-2 sm:gap-3">
        <BoltIcon size={28} />
        <span className="text-lg font-black tracking-tight text-ink sm:text-[22px]">
          PAYZIK
        </span>
      </div>

      {!hideSearch && (
        <div className="relative order-3 w-full lg:order-none lg:ml-auto lg:max-w-md">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Rechercher produit ou client…"
            className="h-11 w-full rounded-xl border border-ink/12 bg-sand/70 pl-9 pr-10 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-violet/60 focus:bg-cream focus:ring-2 focus:ring-violet/20"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden rounded border border-ink/15 px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">
            /
          </kbd>
        </div>
      )}

      {onSwitchProfile && (
        <button
          onClick={onSwitchProfile}
          className={`flex shrink-0 items-center gap-2 rounded-xl border border-ink/12 bg-sand/70 px-3.5 py-2.5 text-[12px] font-bold text-ink/70 transition-colors hover:border-violet/40 hover:bg-violet/10 hover:text-violet-deep ${
            hideSearch ? "ml-auto" : ""
          }`}
        >
          <ArrowLeftRight size={14} /> Changer de profil
        </button>
      )}
    </header>
  );
}

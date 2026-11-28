/** Primitives UI de l'app mobile PAYZIK — palette stricte, mobile-first. */
import {
  CakeSlice,
  Coffee,
  Home,
  Pill,
  ShoppingBasket,
  Store,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Establishment, EstablishmentKind } from "../../types";

export const cx = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(" ");

export const KIND_ICON: Record<EstablishmentKind, typeof Store> = {
  hanout: Store,
  epicerie: ShoppingBasket,
  pharmacie: Pill,
  cafe: Coffee,
  patisserie: CakeSlice,
};

export const KIND_LABEL: Record<EstablishmentKind, string> = {
  hanout: "Hanout",
  epicerie: "Épicerie",
  pharmacie: "Pharmacie",
  cafe: "Café",
  patisserie: "Pâtisserie",
};

/** Horaire d'ouverture plausible et stable (démo). */
export function hoursFor(e: Establishment) {
  const start = 8 + (e.id.length % 2);
  return `Ouvert · ${start}h–21h`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

/* ------------------------------------------------------------------ */
/* Surfaces & boutons                                                   */
/* ------------------------------------------------------------------ */

export function Pane({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "rounded-2xl border border-[#E9DDF2] bg-white shadow-sm",
        onClick && "cursor-pointer active:scale-[.995]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type BtnVariant = "primary" | "green" | "dark" | "soft" | "ghost" | "danger";

export function Btn({
  variant = "primary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const variants: Record<BtnVariant, string> = {
    primary: "bg-[#E91E83] text-white active:bg-[#C2185B] shadow-sm",
    green: "bg-[#059669] text-white active:bg-[#047857] shadow-sm",
    dark: "bg-[#21152C] text-white active:bg-[#160C1D] shadow-sm",
    soft: "bg-[#F1E5FA] text-[#E91E83] active:bg-[#E9DDF2]",
    ghost: "text-[#81748A] active:bg-[#F7F1FB]",
    danger: "bg-[#DC2626] text-white active:bg-[#B91C1C] shadow-sm",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  children,
  onClick,
  className,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E9DDF2] bg-white text-[#21152C] shadow-sm transition active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name: _name,
  size = 40,
  square = false,
  image,
}: {
  name: string;
  size?: number;
  square?: boolean;
  image?: string | null;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt="Photo de profil"
        className={cx(
          "flex shrink-0 items-center justify-center bg-transparent",
          square ? "rounded-xl" : "rounded-full",
        )}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-[#8136A8] to-[#51206F] text-white shadow-sm",
        square ? "rounded-xl" : "rounded-full",
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <UserRound size={Math.max(14, size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Feuille modale (bottom sheet)                                        */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#21152C]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-[#81748A] transition hover:bg-[#F7F1FB]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation basse                                                     */
/* ------------------------------------------------------------------ */

export function TabBar<T extends string>({
  items,
  value,
  onChange,
  columns = 4,
}: {
  items: { id: T; label: string; icon: typeof Home }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-[#E9DDF2] bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.id === value;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className="relative flex flex-col items-center gap-1 py-2.5 transition active:scale-95"
            >
              {active && (
                <span className="absolute -top-px h-0.5 w-8 rounded-full bg-[#E91E83]" />
              )}
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 1.9}
                className={active ? "text-[#E91E83]" : "text-[#A08BAE]"}
              />
              <span
                className={cx(
                  columns > 6 ? "text-[9px] font-semibold" : "text-[10px] font-semibold",
                  active ? "text-[#E91E83]" : "text-[#81748A]",
                )}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Divers                                                               */
/* ------------------------------------------------------------------ */

export function SectionHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[14px] font-bold text-[#21152C]">{title}</h2>
      {action && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#E91E83]"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export function Empty({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#E9DDF2] bg-white px-4 py-8 text-center">
      <span className="text-[#D8C9E4]">{icon}</span>
      <p className="mt-2 text-[12.5px] font-semibold text-[#21152C]">{title}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[#81748A]">{hint}</p>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  icon,
  tone = "dark",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "dark" | "green" | "orange" | "red";
}) {
  const tones = {
    dark: "bg-[#F7F1FB] text-[#21152C]",
    green: "bg-[#ECFDF5] text-[#059669]",
    orange: "bg-[#F1E5FA] text-[#E91E83]",
    red: "bg-[#FCEAF4] text-[#DC2626]",
  };
  return (
    <Pane className="p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#81748A]">
          {label}
        </p>
        <span
          className={cx(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tones[tone],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[16px] font-bold leading-none text-[#21152C]">
        {value}
      </p>
    </Pane>
  );
}

/** Badge de stock : rouge / ambre / vert, texte blanc. */
export function StockPill({ stock }: { stock: number }) {
  if (stock === 0)
    return (
      <span className="rounded-md bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold text-white">
        Rupture
      </span>
    );
  if (stock <= 5)
    return (
      <span className="rounded-md bg-[#F59E0B] px-1.5 py-0.5 text-[9px] font-bold text-white">
        {stock} restants
      </span>
    );
  return (
    <span className="rounded-md bg-[#059669] px-1.5 py-0.5 text-[9px] font-bold text-white">
      {stock} en stock
    </span>
  );
}

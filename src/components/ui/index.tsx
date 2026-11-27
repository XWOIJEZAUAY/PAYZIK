import {
  AlertTriangle,
  CupSoda,
  Milk,
  Package,
  ShoppingBasket,
  Sparkles,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fmtDh } from "../../lib/format";
import type { Product } from "../../types";

export function cn(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

/* ============================================================
   IDENTITÉ PRODUITS — photo si dispo, sinon tuile vectorielle
   (emoji interdits par la charte PAYZIK).
   ============================================================ */

const CATEGORY_STYLE: Record<string, { icon: typeof Package; label: string }> = {
  Boissons: { icon: CupSoda, label: "Boissons" },
  "Épicerie": { icon: ShoppingBasket, label: "Épicerie" },
  Hygiène: { icon: Sparkles, label: "Hygiène" },
  Frais: { icon: Milk, label: "Frais" },
};

export function categoryIcon(category: string) {
  return CATEGORY_STYLE[category]?.icon ?? Package;
}

export function ProductThumb({
  product,
  size = "md",
  className,
}: {
  product: Product;
  size?: "xs" | "sm" | "md" | "card";
  className?: string;
}) {
  const Icon = categoryIcon(product.category);
  const dims = {
    xs: "h-8 w-8 rounded-lg",
    sm: "h-10 w-10 rounded-xl",
    md: "h-14 w-14 rounded-2xl",
    card: "h-full w-full rounded-none",
  }[size];
  const iconSize = { xs: 15, sm: 17, md: 24, card: 44 }[size];

  if (product.image) {
    return (
      <img
        src={product.image}
        alt={product.name}
        className={cn("shrink-0 object-cover ring-1 ring-inset ring-line", dims, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent-soft text-teal-deep dark:text-teal-glow",
        dims,
        className,
      )}
      aria-hidden
    >
      <Icon size={iconSize} strokeWidth={1.8} />
    </span>
  );
}

/* ============================================================
   BADGES & STATUTS (palette : rose / émeraude / ambre / navy / teal)
   ============================================================ */

export type BadgeTone = "rose" | "emerald" | "amber" | "slate" | "navy" | "teal";

const BADGE_TONES: Record<BadgeTone, string> = {
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  navy: "bg-navy text-white border-navy",
  teal: "bg-accent-soft text-teal-deep border-teal/30 dark:text-teal-glow",
};

export function Badge({
  tone = "slate",
  children,
  className,
  icon,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-4",
        BADGE_TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Pastille d'état avec point lumineux. */
export function StatusDot({
  tone,
  children,
}: {
  tone: "emerald" | "amber" | "rose" | "slate" | "teal";
  children: ReactNode;
}) {
  const tones = {
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-200 [--dot:theme(colors.emerald.500)]",
    amber: "bg-amber-50 text-amber-700 border-amber-200 [--dot:theme(colors.amber.500)]",
    rose: "bg-rose-50 text-rose-700 border-rose-200 [--dot:theme(colors.rose.500)]",
    slate: "bg-slate-100 text-slate-600 border-slate-200 [--dot:theme(colors.slate.400)]",
    teal: "bg-accent-soft text-teal-deep border-teal/30 [--dot:theme(colors.teal.DEFAULT)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[--dot] shadow-[0_0_6px_var(--dot)]" />
      {children}
    </span>
  );
}

/** Échelle unique du stock : 0 = rupture · 1–20 = bas · >20 = sain. */
export function stockTone(stock: number): "rose" | "amber" | "emerald" {
  if (stock === 0) return "rose";
  if (stock <= 20) return "amber";
  return "emerald";
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return (
      <span className="inline-flex items-center rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
        Rupture
      </span>
    );
  if (stock <= 5)
    return (
      <span className="inline-flex items-center rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
        {stock} restants
      </span>
    );
  if (stock <= 20)
    return (
      <span className="inline-flex items-center rounded-md bg-yellow-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
        {stock} en stock
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
      {stock} en stock
    </span>
  );
}

/* ============================================================
   BOUTONS
   ============================================================ */

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "amber" | "ghost" | "danger" | "accent";
}) {
  const variants = {
    primary:
      "bg-orange text-night font-bold hover:bg-orange-deep shadow-glow active:scale-[.98]",
    accent:
      "bg-orange text-night font-bold hover:bg-orange-glow shadow-glow active:scale-[.97]",
    dark: "bg-navy-deep text-white hover:bg-navy active:scale-[.98]",
    amber:
      "bg-gold text-night font-bold hover:bg-gold/80 shadow-glow active:scale-[.98]",
    secondary:
      "bg-white text-navy border border-navy/15 hover:bg-orange/10 hover:text-orange-deep hover:border-orange/40 active:scale-[.98]",
    ghost: "text-navy/70 hover:bg-orange/10 hover:text-orange-deep",
    danger: "text-rose-600 hover:bg-rose-50",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ============================================================
   CARTE / SURFACES
   ============================================================ */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

/* ============================================================
   FORMULAIRES
   ============================================================ */

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border bg-surface2 px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-teal focus:bg-surface focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Contrôle segmenté (ex. Comptant / Kridi). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex rounded-xl border bg-surface2 p-1",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150",
              active
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Filtres en pills (ex. liste Kridi). */
export function Pills({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all duration-150",
              active
                ? "border-transparent bg-orange text-night dark:bg-orange dark:text-night"
                : "bg-surface text-muted hover:border-muted/40 hover:text-ink",
            )}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span
                className={cn(
                  "ml-1.5 tnum text-[11px]",
                  active ? "text-orange-glow" : "text-muted",
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   VISUELS MÉTRIQUES — sparkline, jauge, avatar, stat card
   ============================================================ */

export function Sparkline({
  data,
  className,
  stroke = "#8136A8",
  width = 96,
  height = 32,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${pts.join(" L ")}`;
  const area = `${d} L ${width - 2},${height} L 2,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`sp-${stroke.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${stroke.replace("#", "")})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={Number(pts[pts.length - 1].split(",")[0])}
        cy={Number(pts[pts.length - 1].split(",")[1])}
        r="2.5"
        fill={stroke}
      />
    </svg>
  );
}

/** Jauge de progression (stock, risque…). */
export function Gauge({
  value,
  max,
  tone,
  className,
}: {
  value: number;
  max: number;
  tone?: "rose" | "amber" | "emerald" | "teal";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const t = tone ?? stockTone(value);
  const bar = {
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    teal: "bg-teal",
  }[t];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface2", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Avatar initiales (carnet kridi, clients). */
export function Avatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-navy font-bold text-orange-glow ring-1 ring-inset ring-orange/30",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Carte KPI (Executive Bar). */
export function StatCard({
  label,
  value,
  sub,
  icon,
  delta,
  sparkline,
  accent,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  /** variation en % vs la période précédente */
  delta?: number;
  sparkline?: number[];
  accent?: boolean;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-surface p-4 shadow-card",
        accent && "border-transparent bg-orange text-night",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              accent ? "text-orange-glow" : "text-muted",
            )}
          >
            {label}
          </p>
          <p className="money mt-1.5 text-2xl font-bold leading-none">{value}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {typeof delta === "number" && (
              <span
                className={cn(
                  "money text-xs font-semibold",
                  accent
                    ? up
                      ? "text-orange-glow"
                      : "text-rose-300"
                    : up
                      ? "text-emerald-600"
                      : "text-rose-600",
                )}
              >
                {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            {sub && (
              <span className={cn("truncate text-xs", accent ? "text-white/60" : "text-muted")}>
                {sub}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {icon && (
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                accent ? "bg-white/10 text-orange-glow" : "bg-orange/10 text-orange-deep",
              )}
            >
              {icon}
            </span>
          )}
          {sparkline && (
            <Sparkline
              data={sparkline}
              stroke={accent ? "#D3B0E6" : "#8136A8"}
              width={84}
              height={26}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   EN-TÊTES & ÉTATS
   ============================================================ */

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-teal-deep">
        {icon ?? <Sparkles size={22} strokeWidth={1.8} />}
      </span>
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Bandeau d'alerte horizontal (ruptures, impayés…). */
export function AlertBanner({
  tone,
  icon,
  title,
  children,
  actions,
  className,
}: {
  tone: "rose" | "amber" | "teal";
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const tones = {
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    teal: "bg-accent-soft border-teal/30 text-teal-deep dark:text-teal-glow",
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm",
        tones[tone],
        className,
      )}
      role="status"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70">
        {icon ?? <AlertTriangle size={15} />}
      </span>
      <span className="font-bold">{title}</span>
      {children && <span className="min-w-0 flex-1 truncate font-medium opacity-80">{children}</span>}
      {actions}
    </div>
  );
}

/* ============================================================
   MODALE & TIROIR (backdrop-fluide)
   ============================================================ */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy-deep/45 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative max-h-[92vh] w-full animate-scale-in overflow-y-auto rounded-2xl border bg-surface p-6 shadow-pop scrollbar-thin",
          wide ? "max-w-2xl" : "max-w-md",
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-extrabold tracking-tight text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-ink"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-navy-deep/40 backdrop-blur-md" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col border-l bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-sm font-extrabold tracking-tight text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-ink"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t bg-surface2/60 p-4">{footer}</div>}
      </aside>
    </div>
  );
}

/* ============================================================
   QR (génération)
   ============================================================ */

export function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, {
      margin: 1,
      width: size * 2,
      errorCorrectionLevel: "M",
      color: { dark: "#21152C", light: "#FFFFFF" },
    })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={value} className={className} />
  ) : (
    <div
      style={{ width: size, height: size }}
      className={cn("rounded-xl bg-surface2", className)}
    />
  );
}

/** Prix formaté (mono crisp — charte financière). */
export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn("money", className)}>{fmtDh(value)}</span>;
}

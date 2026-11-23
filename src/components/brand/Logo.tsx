/** Identité visuelle PAYZIK — wordmark + éclair (icône seule).
 *  Navy #0B2846 · Éclair Teal #01CCB6. Vectoriel, sans emoji. */

/** Éclair seul, NU (aucun cadre, aucun fond) — pour bandes noires. */
export function BoltIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className ?? ""}`}
      aria-hidden
    >
      <path d="M13.5 2 L5 13.5 h5.5 L9.5 22 L19 10.5 h-5.5 z" fill="#01CCB6" />
    </svg>
  );
}

/** Éclair seul (favicon, sidebar, mobile). */
export function BoltMark({
  size = 28,
  className,
  rounded = "rounded-[7px]",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${rounded} ${className ?? ""}`}
      style={{ width: size, height: size, backgroundColor: "#0B2846" }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M13.5 2 L5 13.5 h5.5 L9.5 22 L19 10.5 h-5.5 z" fill="#01CCB6" />
      </svg>
    </span>
  );
}

/** Logo complet : PAY + éclair teal + IK (le Z du logo = éclair). */
export function PayzikWordmark({
  size = 17,
  className,
  light = false,
}: {
  size?: number;
  className?: string;
  /** variante claire pour fonds sombres */
  light?: boolean;
}) {
  const color = light ? "#FFFFFF" : "#0B2846";
  return (
    <span
      className={`inline-flex select-none items-center font-black tracking-tight ${className ?? ""}`}
      style={{ fontSize: size, lineHeight: 1, color }}
      aria-label="PAYZIK"
    >
      PAY
      <svg
        viewBox="0 0 24 24"
        width={size * 1.05}
        height={size * 1.05}
        fill="none"
        className="mx-[0.02em]"
        aria-hidden
      >
        <path d="M13.5 2 L5 13.5 h5.5 L9.5 22 L19 10.5 h-5.5 z" fill="#01CCB6" />
      </svg>
      IK
    </span>
  );
}

/** Formatage : montants en dirham et ancienneté d'une date. */

export const fmtDh = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0 })} DH`;

export const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

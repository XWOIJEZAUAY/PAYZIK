/** Montant au-delà duquel le PIN de la carte est demandé. */
export const PIN_THRESHOLD = 100;

/** Extrait le code carte d'un contenu QR (gère "PZK-XXXX-YYYY" ou "PAYZIK:..."). */
export function parseCardCode(raw: string) {
  const t = raw.trim();
  const m = t.match(/PZK-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
  if (m) return m[0].toUpperCase();
  const c = t.includes(":") ? t.split(":").pop()! : t;
  return c.trim().toUpperCase();
}

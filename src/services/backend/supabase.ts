/** Ancienne synchronisation `payzik_state` désactivée.
 *
 * Les données vivent désormais dans les tables Supabase (Auth + RLS) et dans
 * le store local. Ce module ne conserve que les signatures historiques pour
 * éviter de casser les imports existants — il ne fait aucun appel réseau.
 */

/** À appeler avant le rendu : ne fait plus rien. */
export async function hydrateBackend(): Promise<"remote" | "local" | "off"> {
  return "off";
}

/** Push cloud : désactivé. */
export async function pushBackend(): Promise<void> {
  /* désactivé */
}

/** Synchronisation périodique : désactivée. */
export function startBackendSync(): () => void {
  return () => {};
}

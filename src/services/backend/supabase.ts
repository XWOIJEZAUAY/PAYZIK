/** Synchronisation optionnelle via Supabase (plan gratuit).
 *
 * Si VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ne sont pas définis, le module
 * ne fait rien et l'application continue à fonctionner uniquement en local.
 *
 * Le schéma SQL est dans supabase/schema.sql. La table `payzik_state` est
 * publique en lecture/écriture : c'est un espace de DÉMO partagé, pas un
 * compte bancaire. Ajoute Supabase Auth + RLS avant d'y mettre des données
 * réelles.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const URL = (env.VITE_SUPABASE_URL ?? "").trim();
const ANON = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
const TABLE = "payzik_state";
const ROW = "demo";
const SYNC_KEY = "payzik.backend.updatedAt";

let client: SupabaseClient | null = null;

export const backendEnabled = () => URL.startsWith("http") && ANON.length > 20;

function getClient(): SupabaseClient | null {
  if (!backendEnabled()) return null;
  if (!client) {
    client = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export type Snapshot = { data: Record<string, string>; updatedAt: string };

/** Toutes les clés `payzik.*` du localStorage, sauf méta-données de sync. */
export function localSnapshot(): Snapshot {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("payzik.") || key === SYNC_KEY) continue;
    data[key] = localStorage.getItem(key) ?? "";
  }
  return { data, updatedAt: new Date().toISOString() };
}

function applySnapshot(data: Record<string, string>) {
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("payzik.") && key !== SYNC_KEY) localStorage.setItem(key, value);
  }
}

function stamp(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** À appeler AVANT le rendu React : remplit le localStorage depuis le cloud. */
export async function hydrateBackend(): Promise<"remote" | "local" | "off"> {
  const sb = getClient();
  if (!sb) return "off";
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("data, updated_at")
      .eq("id", ROW)
      .maybeSingle();
    if (error) return "local";

    const remote = data?.data as Record<string, string> | null;
    if (remote && typeof remote === "object") {
      const remoteAt = String(data?.updated_at ?? "");
      if (stamp(remoteAt) > stamp(localStorage.getItem(SYNC_KEY))) {
        applySnapshot(remote);
        localStorage.setItem(SYNC_KEY, remoteAt);
        return "remote";
      }
    }
  } catch {
    /* réseau indisponible : on garde le localStorage */
  }
  return "local";
}

let lastPushed = "";
let pushing = false;

/** Push debounce-é : n'envoie que si les données ont réellement changé. */
export async function pushBackend(): Promise<void> {
  const sb = getClient();
  if (!sb || pushing) return;
  const snap = localSnapshot();
  const payload = JSON.stringify(snap.data);
  if (payload === lastPushed) return;

  pushing = true;
  try {
    const now = new Date().toISOString();
    const { error } = await sb.from(TABLE).upsert({
      id: ROW,
      data: snap.data,
      updated_at: now,
    });
    if (!error) {
      lastPushed = payload;
      localStorage.setItem(SYNC_KEY, now);
    }
  } catch {
    /* silencieux : l'app reste utilisable hors ligne */
  } finally {
    pushing = false;
  }
}

/** Démarre la synchronisation périodique. Retourne une fonction de nettoyage. */
export function startBackendSync(): () => void {
  if (!backendEnabled()) return () => {};
  const push = () => void pushBackend();
  const timer = window.setInterval(push, 5000);
  document.addEventListener("visibilitychange", push);
  window.addEventListener("online", push);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", push);
    window.removeEventListener("online", push);
  };
}

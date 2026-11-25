/** Authentification Supabase (email + mot de passe) — comptes réels.
 *  Si Supabase n'est pas configuré, l'auth est simulée en localStorage (démo). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const URL = (env.VITE_SUPABASE_URL ?? "").trim();
const ANON = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!URL.startsWith("http") || ANON.length < 20) return null;
  if (!client) client = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export const authEnabled = () => !!getClient();

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: "merchant" | "customer";
  premium: boolean;
};

const LS_USER = "payzik.auth.user";
const LS_ROLE = "payzik.auth.role";

export async function signUp(email: string, password: string, name: string, role: "merchant" | "customer"): Promise<{ ok: boolean; error?: string; user?: Profile; needsConfirm?: boolean }> {
  const sb = getClient();
  if (!sb) {
    // mode démo local
    const u: Profile = { id: "local-" + Date.now(), email, name, role, premium: false };
    localStorage.setItem(LS_USER, JSON.stringify(u));
    localStorage.setItem(LS_ROLE, role);
    return { ok: true, user: u };
  }
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error || !data.user) return { ok: false, error: error?.message ?? "inscription échouée" };
  // Si la confirmation email est activée, l'utilisateur doit vérifier son email.
  const needsConfirm = !data.user.email_confirmed_at;
  if (needsConfirm) {
    return { ok: true, needsConfirm: true };
  }
  const { error: pErr } = await sb.from("profiles").insert({
    id: data.user.id,
    email,
    name,
    role,
    premium: false,
  });
  if (pErr) return { ok: false, error: pErr.message };
  const u: Profile = { id: data.user.id, email, name, role, premium: false };
  localStorage.setItem(LS_USER, JSON.stringify(u));
  localStorage.setItem(LS_ROLE, role);
  return { ok: true, user: u };
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string; user?: Profile; needsConfirm?: boolean }> {
  const sb = getClient();
  if (!sb) {
    const raw = localStorage.getItem(LS_USER);
    if (raw) {
      const u = JSON.parse(raw) as Profile;
      if (u.email === email) {
        localStorage.setItem(LS_ROLE, u.role);
        return { ok: true, user: u };
      }
    }
    return { ok: false, error: "compte introuvable (mode démo)" };
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: error?.message ?? "connexion échouée" };
  const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
  const u: Profile = {
    id: data.user.id,
    email: data.user.email ?? email,
    name: prof?.name ?? email.split("@")[0],
    role: (prof?.role as "merchant" | "customer") ?? "customer",
    premium: !!prof?.premium,
  };
  localStorage.setItem(LS_USER, JSON.stringify(u));
  localStorage.setItem(LS_ROLE, u.role);
  return { ok: true, user: u };
}

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré (mode démo)" };
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getClient();
  if (sb) await sb.auth.signOut();
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_ROLE);
}

export function getCurrentUser(): Profile | null {
  const raw = localStorage.getItem(LS_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function getCurrentRole(): "merchant" | "customer" | null {
  const u = getCurrentUser();
  return u?.role ?? null;
}
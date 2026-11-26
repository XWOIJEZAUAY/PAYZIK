/** Authentification Supabase (email + mot de passe) — comptes réels.
 *  Si Supabase n'est pas configuré, l'auth est simulée en localStorage (démo). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const URL = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const ANON = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!URL.startsWith("http") || ANON.length < 20) return null;
  if (!client) client = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export const authEnabled = () => !!getClient();

/** Accès au client Supabase pour les services backend (cartes, boutiques, recharges). */
export function getSupabaseClient() {
  return getClient();
}

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
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
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

function nameFromUser(u: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = u.user_metadata ?? {};
  const full = (meta.full_name ?? meta.name ?? meta.preferred_username) as string | undefined;
  if (full && String(full).trim()) return String(full).trim();
  if (u.email) return u.email.split("@")[0];
  return "Utilisateur";
}

export async function restoreSession(): Promise<Profile | null> {
  const sb = getClient();
  if (!sb) return getCurrentUser();
  const { data, error } = await sb.auth.getSession();
  if (error) return getCurrentUser();
  const u = data.session?.user;
  if (!u) {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_ROLE);
    return null;
  }
  const { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
  let profile: Profile;
  if (prof) {
    profile = {
      id: u.id,
      email: u.email ?? prof.email ?? "",
      name: prof.name ?? nameFromUser(u),
      role: (prof.role as "merchant" | "customer") ?? "customer",
      premium: !!prof.premium,
    };
  } else {
    const name = nameFromUser(u);
    profile = { id: u.id, email: u.email ?? "", name, role: "customer", premium: false };
    const { error: iErr } = await sb.from("profiles").insert({
      id: u.id,
      email: u.email ?? "",
      name,
      role: "customer",
      premium: false,
    });
    if (iErr && iErr.code !== "23505") {
      console.warn("profile insert:", iErr.message);
    }
  }
  localStorage.setItem(LS_USER, JSON.stringify(profile));
  localStorage.setItem(LS_ROLE, profile.role);
  return profile;
}

export async function verifySignupOtp(
  email: string,
  token: string,
  name: string,
  role: "merchant" | "customer",
): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Code invalide" };

  const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!prof) {
    const { error: pErr } = await sb.from("profiles").insert({
      id: data.user.id,
      email: email.trim(),
      name: name.trim() || email.split("@")[0],
      role,
      premium: false,
    });
    if (pErr && pErr.code !== "23505") return { ok: false, error: pErr.message };
  }

  const u: Profile = {
    id: data.user.id,
    email: data.user.email ?? email.trim(),
    name: prof?.name || name.trim() || email.split("@")[0],
    role: (prof?.role as "merchant" | "customer") ?? role,
    premium: !!prof?.premium,
  };
  localStorage.setItem(LS_USER, JSON.stringify(u));
  localStorage.setItem(LS_ROLE, u.role);
  return { ok: true, user: u };
}

export async function resetPasswordWithOtp(
  email: string,
  token: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "recovery" });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Code invalide" };

  const { error: uErr } = await sb.auth.updateUser({ password: newPassword });
  if (uErr) return { ok: false, error: uErr.message };

  const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  const u: Profile = {
    id: data.user.id,
    email: data.user.email ?? email.trim(),
    name: prof?.name ?? email.split("@")[0],
    role: (prof?.role as "merchant" | "customer") ?? "customer",
    premium: !!prof?.premium,
  };
  localStorage.setItem(LS_USER, JSON.stringify(u));
  localStorage.setItem(LS_ROLE, u.role);
  return { ok: true, user: u };
}

export function subscribeAuth(callback: (user: Profile | null) => void): () => void {
  const sb = getClient();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(LS_ROLE);
      callback(null);
      return;
    }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      const p = await restoreSession();
      callback(p);
    }
  });
  return () => data.subscription.unsubscribe();
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
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
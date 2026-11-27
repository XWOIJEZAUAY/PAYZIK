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

export type ProfileDetails = {
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  image?: string | null;
};

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: "merchant" | "customer";
  premium: boolean;
  /** Compte Google sans profil : le type et les infos doivent encore être choisis. */
  needsRole?: boolean;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  image?: string | null;
};

const LS_USER = "payzik.auth.user";
const LS_ROLE = "payzik.auth.role";

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: "merchant" | "customer",
  details?: ProfileDetails,
): Promise<{ ok: boolean; error?: string; user?: Profile; needsConfirm?: boolean }> {
  const sb = getClient();
  if (!sb) {
    // mode démo local
    const u: Profile = { id: "local-" + Date.now(), email, name, role, premium: false, ...details };
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
    phone: details?.phone ?? null,
    city: details?.city ?? null,
    address: details?.address ?? null,
    responsible_name: details?.responsible ?? null,
  });
  if (pErr) return { ok: false, error: pErr.message };
  const u: Profile = { id: data.user.id, email, name, role, premium: false, ...details };
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
  const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  const u: Profile = {
    id: data.user.id,
    email: data.user.email ?? email,
    name: prof?.name ?? email.split("@")[0],
    role: (prof?.role as "merchant" | "customer") ?? "customer",
    premium: !!prof?.premium,
    needsRole: !prof,
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
  // Vérifie si le compte Google a déjà terminé son setup (stockage persistant)
  const setupDone = localStorage.getItem(`payzik.google.setupDone-${u.id}`);
  const { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
  let profile: Profile;
  if (prof && setupDone) {
    // Profil existant + setup déjà validé → on restaure tel quel
    profile = {
      id: u.id,
      email: u.email ?? prof.email ?? "",
      name: prof.name ?? nameFromUser(u),
      role: (prof.role as "merchant" | "customer") ?? "customer",
      premium: !!prof.premium,
      phone: prof.phone ?? null,
      city: prof.city ?? null,
      address: prof.address ?? null,
      responsible: prof.responsible_name ?? null,
      image: prof.image ?? null,
    };
  } else if (prof && !setupDone) {
    // Profil existé mais setup jamais confirmé → force le choix rôle/infos
    profile = {
      id: u.id,
      email: u.email ?? "",
      name: prof.name ?? nameFromUser(u),
      role: "customer",
      premium: false,
      needsRole: true,
    };
  } else {
    // Pas de profil → Google setup obligatoire
    profile = {
      id: u.id,
      email: u.email ?? "",
      name: nameFromUser(u),
      role: "customer",
      premium: false,
      needsRole: true,
    };
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
  details?: ProfileDetails,
): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const clean = token.trim();
  let { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: clean, type: "email" });
  if ((error || !data.user) && clean.length > 6) {
    const retry = await sb.auth.verifyOtp({ email: email.trim(), token: clean.slice(0, 6), type: "email" });
    if (!retry.error && retry.data.user) {
      data = retry.data;
      error = null;
    }
  }
  if (error || !data.user) return { ok: false, error: error?.message ?? "Code invalide" };

  const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!prof) {
    const { error: pErr } = await sb.from("profiles").insert({
      id: data.user.id,
      email: email.trim(),
      name: name.trim() || email.split("@")[0],
      role,
      premium: false,
      phone: details?.phone ?? null,
      city: details?.city ?? null,
      address: details?.address ?? null,
      responsible_name: details?.responsible ?? null,
    });
    if (pErr && pErr.code !== "23505") return { ok: false, error: pErr.message };
  }

  const u: Profile = {
    id: data.user.id,
    email: data.user.email ?? email.trim(),
    name: prof?.name || name.trim() || email.split("@")[0],
    role: (prof?.role as "merchant" | "customer") ?? role,
    premium: !!prof?.premium,
    phone: (prof as Profile | null)?.phone ?? details?.phone ?? null,
    city: (prof as Profile | null)?.city ?? details?.city ?? null,
    address: (prof as Profile | null)?.address ?? details?.address ?? null,
    responsible: ((prof as { responsible_name?: string } | null)?.responsible_name ?? details?.responsible ?? null),
    image: ((prof as { image?: string } | null)?.image ?? details?.image ?? null),
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
  const clean = token.trim();
  let { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: clean, type: "recovery" });
  if ((error || !data.user) && clean.length > 6) {
    const retry = await sb.auth.verifyOtp({ email: email.trim(), token: clean.slice(0, 6), type: "recovery" });
    if (!retry.error && retry.data.user) {
      data = retry.data;
      error = null;
    }
  }
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
  const clean = email.trim().toLowerCase();
  // Vérification explicite : Supabase ne révèle pas l'existence d'un email,
  // donc on passe par une fonction dédiée qui ne expose pas les profils.
  const { data: exists, error: checkError } = await sb.rpc("payzik_email_exists", { p_email: clean });
  if (checkError) return { ok: false, error: checkError.message };
  if (!exists) {
    return { ok: false, error: "Aucun compte n'existe avec cet email." };
  }
  const { error } = await sb.auth.resetPasswordForEmail(clean, {
    redirectTo: window.location.origin,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateProfile(
  patch: ProfileDetails & { name?: string | null },
): Promise<{ ok: boolean; error?: string; profile?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { error } = await sb.rpc("update_profile", {
    p_name: patch.name ?? null,
    p_phone: patch.phone ?? null,
    p_city: patch.city ?? null,
    p_address: patch.address ?? null,
    p_responsible: patch.responsible ?? null,
    p_image: patch.image ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const profile = await restoreSession();
  return profile ? { ok: true, profile } : { ok: false, error: "Profil introuvable" };
}

/** Finalise un compte Google : crée le profil avec le rôle et les infos choisis. */
export async function completeGoogleSignup(input: {
  role: "merchant" | "customer";
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
}): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: authData } = await sb.auth.getUser();
  if (!authData.user) return { ok: false, error: "Session expirée" };

  const name = (input.name ?? "").trim() || nameFromUser(authData.user);
  const { data: existing } = await sb.from("profiles").select("id").eq("id", authData.user.id).maybeSingle();
  if (!existing) {
    const { error } = await sb.from("profiles").insert({
      id: authData.user.id,
      email: authData.user.email ?? "",
      name,
      role: input.role,
      premium: false,
      phone: input.phone ?? null,
      city: input.city ?? null,
      address: input.address ?? null,
      responsible_name: input.responsible ?? null,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    // Met à jour le profil existant (permet de changer de rôle client↔commerçant)
    const { error } = await sb.rpc("update_profile", {
      p_name: name ?? null,
      p_phone: input.phone ?? null,
      p_city: input.city ?? null,
      p_address: input.address ?? null,
      p_responsible: input.responsible ?? null,
      p_image: null,
    });
    if (error) return { ok: false, error: error.message };
  }
  // Marque le setup comme fait en localStorage (pour ne plus poser de question sur ce device)
  localStorage.setItem(`payzik.google.setupDone-${authData.user.id}`, "1");
  const profile: Profile = {
    id: authData.user.id,
    email: authData.user.email ?? "",
    name,
    role: input.role,
    premium: false,
    phone: input.phone ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    responsible: input.responsible ?? null,
    needsRole: false,
  };
  localStorage.setItem(LS_USER, JSON.stringify(profile));
  localStorage.setItem(LS_ROLE, profile.role);
  return { ok: true, user: profile };
}

/** Efface les données locales isolées par utilisateur (kridi, ventes, cartes). */
export function clearLocalUserData(userId?: string): void {
  const prefix = userId ? `payzik.${userId}.` : "payzik.";
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export async function signOut(): Promise<void> {
  const sb = getClient();
  if (sb) await sb.auth.signOut();
  // On efface tout, y compris le carnet de crédit et les cartes locales.
  clearLocalUserData();
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
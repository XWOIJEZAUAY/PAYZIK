/** Authentification Supabase (email + mot de passe / Google).
 *  PostgreSQL est la source de vérité pour le profil, le rôle et l'onboarding.
 *  Le localStorage n'est qu'un cache d'affichage, jamais une autorité. */
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

export type ShopOnboarding = {
  name?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  responsible?: string | null;
  image?: string | null;
};

export type ShopSummary = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  responsible?: string | null;
  image?: string | null;
  verified?: boolean;
  in_network?: boolean;
  is_active?: boolean;
};

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: "merchant" | "customer";
  premium: boolean;
  /** Vrai uniquement si PostgreSQL indique que des informations manquent. */
  needsRole?: boolean;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  image?: string | null;
  onboardingCompleted?: boolean;
  shops?: ShopSummary[];
};

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  premium?: boolean;
  needsRole?: boolean;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  image?: string | null;
  onboarding_completed?: boolean;
  shops?: ShopSummary[];
};

const LS_USER = "payzik.auth.user";
const LS_ROLE = "payzik.auth.role";
const SETUP_PREFIX = "payzik.google.setupDone-";

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email ?? "",
    name: row.name ?? "",
    role: row.role === "customer" ? "customer" : "merchant",
    premium: !!row.premium,
    needsRole: !!row.needsRole,
    phone: row.phone ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    responsible: row.responsible ?? null,
    image: row.image ?? null,
    onboardingCompleted: !!row.onboarding_completed,
    shops: row.shops ?? [],
  };
}

async function fetchProfile(): Promise<Profile | null> {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc("payzik_get_my_profile", {});
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapProfile(data as ProfileRow);
}

function persistProfile(profile: Profile | null): void {
  if (!profile) {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_ROLE);
    return;
  }
  localStorage.setItem(LS_USER, JSON.stringify(profile));
  localStorage.setItem(LS_ROLE, profile.role);
}

/** Nettoie uniquement le cache d'identité : les données métier locales sont conservées. */
function clearAuthCacheOnly(): void {
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_ROLE);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(SETUP_PREFIX)) localStorage.removeItem(key);
  }
}

const PENDING_KEY = "payzik.pending.onboarding";
const LEGACY_PENDING_KEY = "payzik.pending.shop";

export type PendingOnboarding = {
  email: string;
  role: "merchant" | "customer";
  premium?: boolean;
  name: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  shop?: ShopOnboarding;
};

/** L'intention d'inscription survit au rechargement provoqué par le lien email. */
export function savePendingOnboarding(input: PendingOnboarding): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(input));
}

export function readPendingOnboarding(email?: string | null): PendingOnboarding | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PendingOnboarding;
      if (!email || parsed.email?.toLowerCase() === email.toLowerCase()) return parsed;
    } catch {
      localStorage.removeItem(PENDING_KEY);
    }
  }
  // Compatibilité avec l'ancien brouillon qui ne contenait pas le rôle.
  const legacy = localStorage.getItem(LEGACY_PENDING_KEY);
  if (legacy) {
    try {
      const p = JSON.parse(legacy) as {
        email?: string; name?: string; city?: string; address?: string;
        phone?: string; responsible?: string; image?: string | null;
      };
      if (p.email && (!email || p.email.toLowerCase() === email.toLowerCase())) {
        return {
          email: p.email,
          role: "merchant",
          name: (p.responsible || p.name || "").trim() || p.email.split("@")[0],
          phone: p.phone || null,
          city: p.city || null,
          address: p.address || null,
          responsible: p.responsible || null,
          shop: p.name
            ? {
                name: p.name,
                city: p.city || null,
                address: p.address || null,
                phone: p.phone || null,
                image: p.image ?? null,
              }
            : undefined,
        };
      }
    } catch {
      localStorage.removeItem(LEGACY_PENDING_KEY);
    }
  }
  return null;
}

export function clearPendingOnboarding(): void {
  localStorage.removeItem(PENDING_KEY);
  localStorage.removeItem(LEGACY_PENDING_KEY);
}

type OnboardingInput = {
  role: "merchant" | "customer";
  premium?: boolean;
  name?: string | null;
  details?: ProfileDetails;
  shop?: ShopOnboarding;
};

async function completeOnboarding(input: OnboardingInput): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data, error } = await sb.rpc("payzik_complete_onboarding", {
    p_role: input.role,
    p_name: input.name ?? null,
    p_phone: input.details?.phone ?? null,
    p_city: input.details?.city ?? null,
    p_address: input.details?.address ?? null,
    p_responsible: input.details?.responsible ?? input.shop?.responsible ?? null,
    p_image: input.details?.image ?? null,
    p_shop_name: input.shop?.name ?? null,
    p_shop_city: input.shop?.city ?? null,
    p_shop_address: input.shop?.address ?? null,
    p_shop_phone: input.shop?.phone ?? null,
    p_shop_image: input.shop?.image ?? null,
    p_premium: input.premium ?? false,
  });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Profil non retourné par la base" };
  const profile = mapProfile(data as ProfileRow);
  persistProfile(profile);
  clearPendingOnboarding();
  return { ok: true, user: profile };
}

/** Rejoue une inscription confirmée par email après le rechargement de la page. */
async function resumePendingOnboarding(profile: Profile | null): Promise<Profile | null> {
  if (!profile?.needsRole) return profile;
  const pending = readPendingOnboarding(profile.email);
  if (!pending) return profile;
  const done = await completeOnboarding({
    role: pending.role,
    premium: pending.premium ?? false,
    name: pending.name,
    details: {
      phone: pending.phone ?? null,
      city: pending.city ?? null,
      address: pending.address ?? null,
      responsible: pending.responsible ?? null,
    },
    shop: pending.shop,
  });
  if (!done.ok || !done.user) {
    console.error("PAYZIK — reprise de l'inscription impossible :", done.error);
    return profile;
  }
  return done.user;
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: "merchant" | "customer",
  details?: ProfileDetails,
  shop?: ShopOnboarding,
  premium = false,
): Promise<{ ok: boolean; error?: string; user?: Profile; needsConfirm?: boolean }> {
  const sb = getClient();
  if (!sb) {
    const u: Profile = {
      id: "local-" + Date.now(),
      email,
      name,
      role,
      premium,
      needsRole: false,
      onboardingCompleted: true,
      ...details,
    };
    persistProfile(u);
    return { ok: true, user: u };
  }
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "inscription échouée" };

  const needsConfirm = !data.session && !data.user.email_confirmed_at;
  if (needsConfirm) return { ok: true, needsConfirm: true };

  // Confirmation désactivée : on établit la session puis on persiste via la base.
  const signed = await sb.auth.signInWithPassword({ email, password });
  if (signed.error) return { ok: false, error: signed.error.message };
  const done = await completeOnboarding({ role, premium, name, details, shop });
  if (!done.ok || !done.user) return { ok: false, error: done.error };
  return { ok: true, user: done.user };
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string; user?: Profile; needsConfirm?: boolean }> {
  const sb = getClient();
  if (!sb) {
    const raw = localStorage.getItem(LS_USER);
    if (raw) {
      const u = JSON.parse(raw) as Profile;
      if (u.email === email) return { ok: true, user: u };
    }
    return { ok: false, error: "compte introuvable (mode démo)" };
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  try {
    const profile = await fetchProfile();
    if (!profile) return { ok: false, error: "Profil introuvable en base" };
    persistProfile(profile);
    return { ok: true, user: profile };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture du profil impossible" };
  }
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
  if (!data.session?.user) {
    clearAuthCacheOnly();
    return null;
  }
  try {
    const profile = await resumePendingOnboarding(await fetchProfile());
    if (profile) persistProfile(profile);
    else clearAuthCacheOnly();
    return profile;
  } catch {
    // Panne réseau/passagère : on conserve le dernier cache plutôt que de
    // réinitialiser un rôle existant sur une erreur de lecture.
    return getCurrentUser();
  }
}

export async function verifySignupOtp(
  email: string,
  token: string,
  name: string,
  role: "merchant" | "customer",
  details?: ProfileDetails,
  shop?: ShopOnboarding,
  premium = false,
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
  return completeOnboarding({
    role,
    premium,
    name: name.trim() || data.user.email?.split("@")[0] || "Utilisateur",
    details,
    shop,
  });
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
  try {
    const profile = await fetchProfile();
    if (profile) persistProfile(profile);
    return profile ? { ok: true, user: profile } : { ok: false, error: "Profil introuvable" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture du profil impossible" };
  }
}

/**
 * Un seul écouteur d'état auth pour toute l'application.
 * Les résolutions sont sérialisées : une réponse lente ne peut pas écraser
 * un événement plus récent (login, logout, refresh).
 */
export function startAuthLifecycle(callback: (user: Profile | null) => void): () => void {
  const sb = getClient();
  if (!sb) {
    callback(getCurrentUser());
    return () => {};
  }

  let alive = true;
  let currentCallback = callback;
  let lastUid: string | null = null;
  let lastProfile: Profile | null = null;
  let chain: Promise<void> = Promise.resolve();

  const emit = (profile: Profile | null) => {
    lastProfile = profile;
    lastUid = profile?.id ?? null;
    persistProfile(profile);
    currentCallback(profile);
  };

  // Cache d'affichage uniquement : l'app s'ouvre immédiatement avec le dernier
  // profil connu, puis PostgreSQL confirme ou corrige dès que la requête répond.
  const cached = getCurrentUser();
  if (cached) {
    lastUid = cached.id;
    lastProfile = cached;
    currentCallback(cached);
  }

  const resolve = (uid: string, force: boolean) => {
    chain = chain.then(async () => {
      if (!alive) return;
      if (!force && uid === lastUid && lastProfile) return;
      try {
        const profile = await resumePendingOnboarding(await fetchProfile());
        if (alive) emit(profile);
      } catch {
        const cached = getCurrentUser();
        if (alive && cached?.id === uid) emit(cached);
      }
    });
  };

  const { data } = sb.auth.onAuthStateChange((event, session) => {
    if (!alive) return;
    if (event === "SIGNED_OUT" || !session?.user) {
      clearAuthCacheOnly();
      emit(null);
      return;
    }
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      resolve(session.user.id, event !== "TOKEN_REFRESHED");
    }
  });

  return () => {
    alive = false;
    data.subscription.unsubscribe();
  };
}

/** Conservé pour compatibilité : délègue au cycle de vie unique. */
export function subscribeAuth(callback: (user: Profile | null) => void): () => void {
  return startAuthLifecycle(callback);
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const clean = email.trim().toLowerCase();
  const { data: exists, error: checkError } = await sb.rpc("payzik_email_exists", { p_email: clean });
  if (checkError) return { ok: false, error: checkError.message };
  if (!exists) return { ok: false, error: "Aucun compte n'existe avec cet email." };
  const { error } = await sb.auth.resetPasswordForEmail(clean, { redirectTo: window.location.origin });
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
  try {
    const profile = await fetchProfile();
    if (!profile) return { ok: false, error: "Profil introuvable" };
    persistProfile(profile);
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture du profil impossible" };
  }
}

/** Finalise un compte Google via la même transaction que l'inscription email. */
export async function completeGoogleSignup(input: {
  role: "merchant" | "customer";
  premium?: boolean;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  responsible?: string | null;
  shop?: ShopOnboarding;
}): Promise<{ ok: boolean; error?: string; user?: Profile }> {
  const sb = getClient();
  if (!sb) return { ok: false, error: "Supabase non configuré" };
  const { data: authData } = await sb.auth.getUser();
  if (!authData.user) return { ok: false, error: "Session expirée" };

  const name = (input.name ?? "").trim() || nameFromUser(authData.user);
  return completeOnboarding({
    role: input.role,
    premium: input.premium ?? false,
    name,
    details: {
      phone: input.phone ?? null,
      city: input.city ?? null,
      address: input.address ?? null,
      responsible: input.responsible ?? null,
    },
    shop: input.shop,
  });
}

/** Efface les données locales isolées par utilisateur ( Usage explicite uniquement ). */
export function clearLocalUserData(userId?: string): void {
  const prefix = userId ? `payzik.${userId}.` : "payzik.";
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export async function signOut(): Promise<void> {
  const sb = getClient();
  if (sb) {
    const { error } = await sb.auth.signOut();
    if (error) throw new Error(error.message);
  }
  // Ne plus effacer les données métier locales à la déconnexion.
  clearAuthCacheOnly();
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
  return getCurrentUser()?.role ?? null;
}

import { LogIn, UserPlus, Store, Wallet } from "lucide-react";
import { useState } from "react";
import { signIn, signUp, signInWithGoogle, type Profile } from "../../services/auth";
import { Button, Card, Input } from "../../components/ui";

export function AuthView({ onAuth }: { onAuth: (user: Profile) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"merchant" | "customer">("customer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email et mot de passe requis");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Nom requis");
      return;
    }
    setBusy(true);
    const res =
      mode === "login"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim(), role);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Erreur");
      return;
    }
    if (res.needsConfirm) {
      setConfirmSent(true);
      return;
    }
    if (res.user) onAuth(res.user);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-ink">PAYZIK</h1>
          <p className="text-sm text-slate-400">
            {mode === "login" ? "Connexion" : "Créer un compte"}
          </p>
        </div>

        {confirmSent && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
            ✉️ Un email de vérification a été envoyé à <strong>{email}</strong>.
            <br />
            Clique sur le lien dans l'email pour activer ton compte, puis connecte-toi.
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setMode("login")}
            className={
              "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
              (mode === "login"
                ? "border-brand bg-brand text-white"
                : "bg-white text-slate-500 hover:bg-slate-50")
            }
          >
            <LogIn size={14} className="mr-1 inline" /> Se connecter
          </button>
          <button
            onClick={() => setMode("signup")}
            className={
              "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
              (mode === "signup"
                ? "border-brand bg-brand text-white"
                : "bg-white text-slate-500 hover:bg-slate-50")
            }
          >
            <UserPlus size={14} className="mr-1 inline" /> Créer un compte
          </button>
        </div>

        {mode === "signup" && (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom complet"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRole("customer")}
                className={
                  "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
                  (role === "customer"
                    ? "border-brand bg-brand text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50")
                }
              >
                <Wallet size={14} className="mr-1 inline" /> Utilisateur
              </button>
              <button
                onClick={() => setRole("merchant")}
                className={
                  "flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
                  (role === "merchant"
                    ? "border-brand bg-brand text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50")
                }
              >
                <Store size={14} className="mr-1 inline" /> Commerçant
              </button>
            </div>
          </>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider text-slate-400">
            <span className="bg-white px-2">ou</span>
          </div>
        </div>

        <button
          onClick={async () => {
            setBusy(true);
            const res = await signInWithGoogle();
            setBusy(false);
            if (!res.ok) setError(res.error ?? "Google non disponible (configure Supabase)");
          }}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.2 5.2C41 35.6 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuer avec Google
        </button>

        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
        />

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <Button variant="primary" className="w-full" disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}
        </Button>

        <p className="text-center text-[11px] text-slate-400">
          {authEnabled()
            ? "Comptes réels (Supabase)"
            : "Mode démo (localStorage) — configure Supabase pour des comptes réels"}
        </p>
      </Card>
    </div>
  );
}

function authEnabled() {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = (env.VITE_SUPABASE_URL ?? "").trim();
  const anon = (env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  return url.startsWith("http") && anon.length > 20;
}
import { useEffect, useState } from "react";
import { AuthView } from "../features/auth/AuthView";
import { GoogleSetup } from "../features/auth/GoogleSetup";
import { PayzikMobile } from "../features/mobile/PayzikMobile";
import { startAuthLifecycle, signOut, type Profile } from "../services/auth";
import { useStore } from "../state/store";

function AppShell({
  user,
  onLogout,
  onUserUpdate,
}: {
  user: Profile;
  onLogout: () => void;
  onUserUpdate: (u: Profile) => void;
}) {
  const store = useStore(user.id);

  return (
    <PayzikMobile
      store={store}
      user={user}
      onLogout={onLogout}
      onUserUpdate={onUserUpdate}
    />
  );
}

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const stop = startAuthLifecycle((next) => {
      if (!active) return;
      setUser(next);
      setAuthReady(true);
    });
    // Évite un écran « Chargement… » infini si une requête réseau bloque.
    const timer = window.setTimeout(() => {
      if (active) setAuthReady(true);
    }, 4000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  if (!authReady && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-sm text-slate-400">Chargement…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuth={(u) => setUser(u)} />;
  }

  if (user.needsRole) {
    return <GoogleSetup user={user} onDone={setUser} />;
  }

  return (
    <AppShell
      user={user}
      onUserUpdate={setUser}
      onLogout={() => {
        void signOut();
        setUser(null);
      }}
    />
  );
}
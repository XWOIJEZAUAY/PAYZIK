import { useEffect, useState } from "react";
import { AuthView } from "../features/auth/AuthView";
import { PayzikMobile } from "../features/mobile/PayzikMobile";
import { getCurrentUser, restoreSession, subscribeAuth, signOut, type Profile } from "../services/auth";
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
  const [user, setUser] = useState<Profile | null>(() => getCurrentUser());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const restored = await restoreSession();
      if (!active) return;
      if (restored) setUser(restored);
      setAuthReady(true);
    })();
    const unsubscribe = subscribeAuth((u) => {
      if (!active) return;
      setUser(u);
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
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
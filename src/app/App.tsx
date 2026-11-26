import { useState } from "react";
import { AuthView } from "../features/auth/AuthView";
import { PayzikMobile } from "../features/mobile/PayzikMobile";
import { getCurrentUser, signOut, type Profile } from "../services/auth";
import { useStore } from "../state/store";

export default function App() {
  const store = useStore();
  const [user, setUser] = useState<Profile | null>(() => getCurrentUser());

  /* ---------------- écran d'entrée : authentification ---------------- */
  if (!user) {
    return <AuthView onAuth={(u) => setUser(u)} />;
  }

  /* ---------------- application mobile (double profil) ---------------- */
  return (
    <PayzikMobile
      store={store}
      user={user}
      onLogout={() => {
        void signOut();
        setUser(null);
      }}
    />
  );
}

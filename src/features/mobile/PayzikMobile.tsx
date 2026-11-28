/** PAYZIK — coquille mobile : un seul type de compte par email.
 *  100% mobile-first, largeur max 430px, palette stricte. */
import { Check } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Profile } from "../../services/auth";
import type { Store as StoreType } from "../../state/store";
import type { ClientTab } from "./client";
import type { MerchantTab } from "./merchant";
import { ProfileSettings } from "./ProfileSettings";

const ClientSpace = lazy(() =>
  import("./client").then((m) => ({ default: m.ClientSpace })),
);
const MerchantSpace = lazy(() =>
  import("./merchant").then((m) => ({ default: m.MerchantSpace })),
);

export function PayzikMobile({
  store,
  user,
  onLogout,
  onUserUpdate,
}: {
  store: StoreType;
  user: Profile;
  onLogout: () => void;
  onUserUpdate: (u: Profile) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clientTab, setClientTab] = useState<ClientTab>("home");
  const [merchantTab, setMerchantTab] = useState<MerchantTab>("home");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3500);
  };

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#E9DDF2]">
      <div className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#FDF9FE] shadow-xl">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Chargement…
            </div>
          }
        >
          {user.role === "merchant" ? (
            <MerchantSpace
              store={store}
              tab={merchantTab}
              setTab={setMerchantTab}
              onProfile={() => setSettingsOpen(true)}
              notify={notify}
              user={user}
            />
          ) : (
            <ClientSpace
              user={user}
              tab={clientTab}
              setTab={setClientTab}
              onProfile={() => setSettingsOpen(true)}
              notify={notify}
            />
          )}
        </Suspense>

        {settingsOpen && (
          <div className="absolute inset-0 z-50">
            <ProfileSettings
              user={user}
              onClose={() => setSettingsOpen(false)}
              onUpdated={onUserUpdate}
              onLogout={onLogout}
              notify={notify}
            />
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+64px)] z-[60] w-[calc(100%-32px)] -translate-x-1/2">
            <div className="animate-toast-in flex items-center gap-2 rounded-xl bg-[#21152C] px-3.5 py-2.5 text-[12px] font-semibold text-white shadow-lg">
              <Check size={15} className="shrink-0 text-[#34D399]" />
              <span className="min-w-0 flex-1">{toast}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

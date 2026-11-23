import { useEffect, useState } from "react";
import { AgentChat } from "../features/pos/AgentChat";
import { CardsView } from "../features/cards/CardsView";
import { CatalogueView } from "../features/catalogue/CatalogueView";
import { CustomerApp } from "../features/customer/CustomerApp";
import { DashboardView } from "../features/dashboard/DashboardView";
import { Header } from "../components/layout/Header";
import { KridiView } from "../features/kridi/KridiView";
import { LandingView } from "../features/landing/LandingView";
import { RestaurantApp } from "../features/restaurant/RestaurantApp";
import { ScannerModal } from "../features/voice/ScannerModal";
import { SettingsView } from "../features/settings/SettingsView";
import { Sidebar } from "../components/layout/Sidebar";
import { MobileTabBar } from "../components/layout/MobileTabBar";
import { StockAlertsDrawer } from "../features/stock/StockAlertsDrawer";
import { StockView } from "../features/stock/StockView";
import { startBackendSync } from "../services/backend/supabase";
import { useStore } from "../state/store";
import type { Role, View } from "../types";

export default function App() {
  const store = useStore();
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>("pos");
  const [search, setSearch] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => startBackendSync(), []);

  const debtors = store.clients.filter((c) => c.debtDh > 0).length;

  /* ---------------- écran d'entrée : choix du profil ---------------- */
  if (role === null) {
    return <LandingView onSelect={setRole} />;
  }

  /* ---------------- espace utilisateur PAYZIK ---------------- */
  if (role === "customer") {
    return <CustomerApp store={store} onSwitchProfile={() => setRole(null)} />;
  }

  /* ---------------- espace restaurant ---------------- */
  if (role === "restaurant") {
    return <RestaurantApp store={store} onSwitchProfile={() => setRole(null)} />;
  }

  /* ---------------- espace commerçant (caisse existante) ---------------- */
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom)_+_4rem)] lg:pb-0">
      <Header
        store={store}
        search={search}
        onSearch={setSearch}
        onOpenAlerts={() => setAlertsOpen(true)}
        hideSearch={view === "pos" || view === "catalogue"}
        onSwitchProfile={() => setRole(null)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onChange={setView} kridiBadge={debtors} />

        {view === "pos" ? (
          /* CAISSE = AGENT IA plein écran (chat) — plus de grille produits ni de ticket latéral */
          <AgentChat store={store} onOpenScanner={() => setScannerOpen(true)} />
        ) : (
          <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
            {view === "kridi" && <KridiView store={store} />}
            {view === "catalogue" && <CatalogueView store={store} />}
            {view === "cards" && <CardsView store={store} />}
            {view === "stock" && <StockView store={store} />}
            {view === "dashboard" && <DashboardView store={store} />}
            {view === "settings" && <SettingsView store={store} />}
          </main>
        )}
      </div>

      <StockAlertsDrawer store={store} open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <ScannerModal store={store} open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <MobileTabBar view={view} onChange={setView} kridiBadge={debtors} />
    </div>
  );
}

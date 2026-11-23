import {
  ArrowRight,
  Check,
  ChefHat,
  ShieldCheck,
  Store,
  UtensilsCrossed,
  Wallet,
  Wifi,
} from "lucide-react";
import type { Role } from "../../types";
import { BoltIcon } from "../../components/brand/Logo";

const ROLES: {
  role: Role;
  icon: typeof Store;
  kicker: string;
  title: string;
  text: string;
  bullets: string[];
  cta: string;
}[] = [
  {
    role: "merchant",
    icon: Store,
    kicker: "Commerçant",
    title: "Ma caisse & mon hanout",
    text: "Encaisse, suis ton stock et ton kridi. La carte PAYZIK passe partout.",
    bullets: ["Encaissement rapide", "Stock et dettes en direct", "Cartes acceptées"],
    cta: "Ouvrir ma caisse",
  },
  {
    role: "customer",
    icon: Wallet,
    kicker: "Particulier",
    title: "Mon solde & mes offres",
    text: "Ta carte, ton argent et les bons plans des commerces autour de toi.",
    bullets: ["Solde en direct", "Cashback partenaire", "Paiement en un geste"],
    cta: "Ouvrir mon portefeuille",
  },
  {
    role: "restaurant",
    icon: UtensilsCrossed,
    kicker: "Restaurant",
    title: "Le service à table",
    text: "Le client commande à sa table. La cuisine reçoit, la caisse encaisse.",
    bullets: ["Commande en 1 clic", "Envoyée en cuisine", "Paiement immédiat"],
    cta: "Ouvrir le service",
  },
];

export function LandingView({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <div className="bg-gradient-to-r from-orange-deep via-orange to-orange-deep text-cream shadow-lg">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <BoltIcon size={30} className="text-cream" />
            <span className="text-[22px] font-black tracking-tight">PAYZIK</span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-cream/20 px-3.5 py-1.5 text-xs font-black">
            <Wifi size={14} /> Réseau actif
          </span>
        </header>
      </div>

      <main className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
        <section className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-orange via-orange-deep to-coral p-6 text-cream shadow-glow sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cream/20 blur-3xl"
          />
          <p className="relative inline-flex items-center gap-2 rounded-full bg-cream/20 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]">
            <ShieldCheck size={14} /> Le réseau des commerces du Maroc
          </p>
          <h1 className="relative mt-5 text-[40px] font-black leading-[1.04] tracking-tight sm:text-[56px]">
            Un seul solde.
            <br />
            <span className="text-cream">Tous tes commerces.</span>
          </h1>
          <p className="relative mt-5 max-w-lg text-base font-semibold text-cream/90">
            Une carte, un solde, et tous les partenaires PAYZIK autour de toi.
          </p>

          <div className="relative mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { value: "12", label: "commerces" },
              { value: "4", label: "villes" },
              { value: "0 DH", label: "frais" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-cream/15 px-4 py-3 backdrop-blur-sm">
                <p className="text-2xl font-black">{s.value}</p>
                <p className="mt-0.5 text-xs font-bold text-cream/80">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.role}
                onClick={() => onSelect(r.role)}
                className="group rounded-3xl border border-orange/20 bg-surface p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-orange/50 hover:shadow-pop"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange/12 text-orange-deep">
                  <Icon size={23} strokeWidth={2.2} />
                </span>
                <p className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-orange-deep">
                  {r.kicker}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight">{r.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.text}</p>
                <ul className="mt-4 space-y-1.5">
                  {r.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-xs font-bold text-ink/80">
                      <Check size={14} className="text-orange" /> {b}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange px-4 py-2.5 text-xs font-black text-cream transition-colors group-hover:bg-orange-deep">
                  {r.cta} <ArrowRight size={14} />
                </span>
              </button>
            );
          })}
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-orange/20 pt-5 text-xs font-bold text-orange-deep">
          <span className="inline-flex items-center gap-2">
            <ChefHat size={14} /> Caisse · Restaurant · Portefeuille
          </span>
          <span>PAYZIK — Le réseau des commerces connectés</span>
        </footer>
      </main>
    </div>
  );
}

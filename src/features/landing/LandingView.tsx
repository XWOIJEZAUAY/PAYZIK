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
  glow: string;
  ring: string;
  tile: string;
}[] = [
  {
    role: "merchant",
    icon: Store,
    kicker: "Commerçant",
    title: "Ma caisse & mon hanout",
    text: "Encaisse, suis ton stock et ton kridi. La carte PAYZIK passe partout.",
    bullets: ["Encaissement rapide", "Stock et dettes en direct", "Cartes acceptées"],
    cta: "Ouvrir ma caisse",
    glow: "from-violet/30 to-transparent",
    ring: "hover:border-violet/60",
    tile: "bg-violet text-cream",
  },
  {
    role: "customer",
    icon: Wallet,
    kicker: "Particulier",
    title: "Mon solde & mes offres",
    text: "Ta carte, ton argent et les bons plans des commerces autour de toi.",
    bullets: ["Solde en direct", "Cashback partenaire", "Paiement en un geste"],
    cta: "Ouvrir mon portefeuille",
    glow: "from-coral/25 to-transparent",
    ring: "hover:border-coral/60",
    tile: "bg-coral text-night",
  },
  {
    role: "restaurant",
    icon: UtensilsCrossed,
    kicker: "Restaurant",
    title: "Le service à table",
    text: "Le client commande à sa table. La cuisine reçoit, la caisse encaisse.",
    bullets: ["Commande en 1 clic", "Envoyée en cuisine", "Paiement immédiat"],
    cta: "Ouvrir le service",
    glow: "from-gold/25 to-transparent",
    ring: "hover:border-gold/60",
    tile: "bg-gold text-night",
  },
];

export function LandingView({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-night text-cream">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-violet/25 blur-[130px]" />
        <div className="absolute -bottom-56 right-0 h-[520px] w-[520px] rounded-full bg-coral/15 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #FFF8EA 1px, transparent 1px), linear-gradient(to bottom, #FFF8EA 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at 30% 20%, #FFF8EA 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <BoltIcon size={30} />
            <span className="text-[22px] font-black tracking-tight">PAYZIK</span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3.5 py-1.5 text-xs font-bold text-violet-glow">
            <Wifi size={14} /> Réseau actif
          </span>
        </header>

        <main className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <section className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-glow">
              <ShieldCheck size={14} /> Le réseau des commerces du Maroc
            </p>
            <h1 className="mt-6 text-[42px] font-black leading-[1.03] tracking-tight sm:text-[58px]">
              Un seul solde.
              <br />
              <span className="bg-gradient-to-r from-violet-glow via-violet to-coral bg-clip-text text-transparent">
                Tous tes commerces.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-base font-medium leading-relaxed text-cream/70">
              Une carte, un solde, et tous les partenaires PAYZIK autour de toi.
            </p>

            <div className="mt-9 grid max-w-md grid-cols-3 gap-3">
              {[
                { value: "12", label: "commerces" },
                { value: "4", label: "villes" },
                { value: "0 DH", label: "frais" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-cream/12 bg-cream/[0.05] px-4 py-3.5"
                >
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="mt-0.5 text-xs font-semibold text-cream/55">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            {ROLES.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.role}
                  onClick={() => onSelect(r.role)}
                  className={`group relative w-full overflow-hidden rounded-3xl border border-cream/12 bg-cream/[0.05] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-cream/[0.08] ${r.ring}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${r.glow} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <div className="relative flex items-start gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${r.tile} shadow-lg`}>
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-glow">
                        {r.kicker}
                      </p>
                      <h2 className="mt-1 text-xl font-black tracking-tight">{r.title}</h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-cream/65">{r.text}</p>
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                        {r.bullets.map((b) => (
                          <li key={b} className="flex items-center gap-1.5 text-xs font-semibold text-cream/75">
                            <Check size={13} className="text-violet-glow" /> {b}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-black text-violet-glow">
                        {r.cta} <ArrowRight size={14} />
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cream/12 py-5 text-xs text-cream/50">
          <span className="inline-flex items-center gap-2">
            <ChefHat size={14} /> Caisse · Restaurant · Portefeuille
          </span>
          <span>PAYZIK — Le réseau des commerces connectés</span>
        </footer>
      </div>
    </div>
  );
}

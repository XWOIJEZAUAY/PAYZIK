/** Écran d'entrée professionnel : choix du profil (commerçant, client, restaurant).
 *  Les 3 espaces partagent le même réseau, la même carte et les mêmes paiements. */
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
    text: "Caisse vocale, stock, carnet kridi et encaissement carte — l'IA fait le travail, tu valides.",
    bullets: ["Caisse vocale darija", "Stock et crédit en direct", "Cartes PAYZIK acceptées"],
    cta: "Ouvrir ma caisse",
    glow: "from-teal/20 to-transparent",
    ring: "hover:border-teal/50",
    tile: "bg-teal text-navy",
  },
  {
    role: "customer",
    icon: Wallet,
    kicker: "Utilisateur PAYZIK",
    title: "Mon portefeuille & mes offres",
    text: "Toute ta carte, ton solde, tes dépenses et les meilleures offres de tous les partenaires.",
    bullets: ["Carte et solde en temps réel", "Cashback chez les partenaires", "Paiement en un geste"],
    cta: "Entrer dans mon espace",
    glow: "from-sky-400/20 to-transparent",
    ring: "hover:border-sky-400/50",
    tile: "bg-sky-400 text-navy",
  },
  {
    role: "restaurant",
    icon: UtensilsCrossed,
    kicker: "Restaurant",
    title: "Le service à table, sans serveur",
    text: "Le client choisit sa table et ses plats. La cuisine reçoit tout, la caisse encaisse sans attente.",
    bullets: ["Table numérotée en 1 clic", "Commande envoyée en cuisine", "Mêmes moyens de paiement"],
    cta: "Ouvrir le service",
    glow: "from-amber-400/20 to-transparent",
    ring: "hover:border-amber-400/50",
    tile: "bg-amber-400 text-navy",
  },
];

export function LandingView({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050B14] text-white">
      {/* halos & grille */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-teal/15 blur-[120px]" />
        <div className="absolute -bottom-56 right-0 h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <BoltIcon size={30} />
            <span className="text-[21px] font-black tracking-tight">PAYZIK</span>
            <span className="hidden rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 sm:inline">
              Réseau
            </span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/70">
            <Wifi size={13} className="text-teal" /> 3 espaces connectés
          </span>
        </header>

        <main className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.02fr_1fr] lg:gap-14 lg:py-10">
          {/* ---------------- promesse ---------------- */}
          <section className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-teal">
              <ShieldCheck size={13} /> Le réseau des commerces de proximité
            </p>
            <h1 className="mt-5 text-[38px] font-black leading-[1.02] tracking-tight sm:text-[52px]">
              Le hanout, le restaurant
              <br />
              et le client.
              <br />
              <span className="bg-gradient-to-r from-teal via-teal-glow to-sky-300 bg-clip-text text-transparent">
                Enfin connectés.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] font-medium leading-relaxed text-white/60">
              Une seule carte, un seul solde, un seul réseau. Choisis ton espace :
              tout ce que tu fais ici se retrouve chez les autres, en temps réel.
            </p>

            <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
              {[
                { value: "12", label: "commerces" },
                { value: "4", label: "villes" },
                { value: "0 DH", label: "de frais" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <p className="text-xl font-black text-white">{s.value}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-7 flex items-center gap-2 text-[12px] font-medium text-white/40">
              <Check size={14} className="text-teal" /> Aucune inscription · démo locale ·
              données conservées sur cet appareil
            </p>
          </section>

          {/* ---------------- choix du profil ---------------- */}
          <section className="space-y-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">
              Choisis ton espace
            </p>
            {ROLES.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.role}
                  onClick={() => onSelect(r.role)}
                  className={`group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] ${r.ring}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${r.glow} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <div className="relative flex items-start gap-4">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${r.tile} shadow-lg`}
                    >
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                        {r.kicker}
                      </p>
                      <h2 className="mt-0.5 text-[17px] font-extrabold tracking-tight text-white">
                        {r.title}
                      </h2>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{r.text}</p>
                      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                        {r.bullets.map((b) => (
                          <li
                            key={b}
                            className="flex items-center gap-1 text-[11px] font-semibold text-white/65"
                          >
                            <Check size={11} className="text-teal" /> {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition-all group-hover:border-teal group-hover:bg-teal group-hover:text-navy">
                      <ArrowRight size={16} />
                    </span>
                  </div>
                  <p className="relative mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-teal opacity-0 transition-opacity group-hover:opacity-100">
                    {r.cta}
                  </p>
                </button>
              );
            })}
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-5 text-[11px] text-white/35">
          <span className="inline-flex items-center gap-2">
            <ChefHat size={13} /> Restaurant · Caisse · Portefeuille — un seul réseau
          </span>
          <span>© {new Date().getFullYear()} PAYZIK — prototype de démonstration</span>
        </footer>
      </div>
    </div>
  );
}

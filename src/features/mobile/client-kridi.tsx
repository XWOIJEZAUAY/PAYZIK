/** Espace CLIENT — carnet Kridi et profil. */
import { ArrowLeftRight, BookOpen, ChevronRight, LogOut } from "lucide-react";
import { useState } from "react";
import { fmtDh } from "../../lib/format";
import type { Profile } from "../../services/auth";
import { Avatar, cx, fmtDate, Pane } from "./ui";

interface ClientDebt {
  id: string;
  merchant: string;
  district: string;
  amountDh: number;
  due: string;
  items: { name: string; qty: number; priceDh: number }[];
}

const CLIENT_KRIDI: ClientDebt[] = [
  {
    id: "ck1",
    merchant: "Hanout Al Baraka",
    district: "Maârif",
    amountDh: 120,
    due: "2026-11-20",
    items: [
      { name: "Lait Centrale 1L", qty: 4, priceDh: 7 },
      { name: "Sukkar 1kg", qty: 4, priceDh: 6 },
      { name: "Sidi Ali 1.5L", qty: 3, priceDh: 6 },
      { name: "Thé Sultan 200g", qty: 2, priceDh: 12 },
    ],
  },
  {
    id: "ck2",
    merchant: "Épicerie Al Amal",
    district: "Derb Sultan",
    amountDh: 45,
    due: "2026-12-02",
    items: [
      { name: "Huile Lesieur 1L", qty: 1, priceDh: 18 },
      { name: "Riz Safa 1kg", qty: 1, priceDh: 12 },
      { name: "Tomate concentrée", qty: 3, priceDh: 5 },
    ],
  },
  {
    id: "ck3",
    merchant: "Boulangerie Al Firdaous",
    district: "Gauthier",
    amountDh: 18,
    due: "2026-12-05",
    items: [
      { name: "Pain complet 500g", qty: 6, priceDh: 1.5 },
      { name: "Msemen 4 pièces", qty: 1, priceDh: 8 },
    ],
  },
];

export function ClientKridi({
  user,
  onSwitch,
  onLogout,
  notify,
}: {
  user: Profile;
  onSwitch: () => void;
  onLogout: () => void;
  notify: (m: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const total = CLIENT_KRIDI.reduce((s, k) => s + k.amountDh, 0);

  return (
    <div className="animate-fade-up space-y-3">
      <Pane className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-[#64748B]">Total dû au quartier</p>
            <p className="mt-1 font-mono text-[26px] font-bold text-[#DC2626]">{fmtDh(total)}</p>
            <p className="mt-0.5 text-[11px] text-[#64748B]">
              Chez {CLIENT_KRIDI.length} commerçants · à régler avant échéance.
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626]">
            <BookOpen size={20} />
          </span>
        </div>
      </Pane>

      {CLIENT_KRIDI.map((k) => {
        const late = new Date(k.due) < new Date();
        const isOpen = open === k.id;
        return (
          <Pane key={k.id} className="p-3">
            <button
              onClick={() => setOpen(isOpen ? null : k.id)}
              className="flex w-full items-center gap-3 text-left"
            >
              <Avatar name={k.merchant} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#0F172A]">{k.merchant}</p>
                <p className="text-[10.5px] text-[#64748B]">
                  {k.district} · échéance {fmtDate(k.due)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[14px] font-bold text-[#0F172A]">
                  {fmtDh(k.amountDh)}
                </p>
                <span
                  className={cx(
                    "text-[9.5px] font-bold",
                    late ? "text-[#DC2626]" : "text-[#059669]",
                  )}
                >
                  {late ? "En retard" : "À venir"}
                </span>
              </div>
              <ChevronRight
                size={15}
                className={cx(
                  "shrink-0 text-[#94A3B8] transition-transform",
                  isOpen && "rotate-90",
                )}
              />
            </button>

            {isOpen && (
              <div className="mt-2 space-y-1 border-t border-[#F1F5F9] pt-2">
                {k.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#64748B]">
                      {it.qty}× {it.name}
                    </span>
                    <span className="font-mono font-semibold text-[#0F172A]">
                      {fmtDh(it.qty * it.priceDh)}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() =>
                    notify(`Paiement de ${fmtDh(k.amountDh)} à ${k.merchant} bientôt disponible`)
                  }
                  className="mt-1 w-full rounded-lg bg-[#0F172A] py-2 text-[11px] font-bold text-white active:scale-[.98]"
                >
                  Régler par PAYZIK
                </button>
              </div>
            )}
          </Pane>
        );
      })}

      <Pane className="p-4">
        <h3 className="text-[13px] font-bold text-[#0F172A]">Mon profil</h3>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={user.name} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[#0F172A]">{user.name}</p>
            <p className="truncate text-[11px] text-[#64748B]">{user.email}</p>
            <p className="text-[10.5px] text-[#94A3B8]">Casablanca · Maârif</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onSwitch}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] py-2.5 text-[11.5px] font-bold text-[#0F172A] active:scale-[.98]"
          >
            <ArrowLeftRight size={14} /> Espace commerçant
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FEF2F2] py-2.5 text-[11.5px] font-bold text-[#DC2626] active:scale-[.98]"
          >
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </Pane>
    </div>
  );
}

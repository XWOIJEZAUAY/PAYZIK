/** Espace CLIENT — carnet Kridi et profil. */
import { BookOpen, ChevronRight, LogOut } from "lucide-react";
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

/** Aucune donnée simulée : les dettes Kridi viendront de Supabase. */
const CLIENT_KRIDI: ClientDebt[] = [];

export function ClientKridi({
  user,
  onProfile,
  notify,
}: {
  user: Profile;
  onProfile: () => void;
  notify: (m: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const total = CLIENT_KRIDI.reduce((s, k) => s + k.amountDh, 0);

  return (
    <div className="animate-fade-up space-y-2.5">
      <Pane className="p-3.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-[#64748B]">Total dû au quartier</p>
            <p className="mt-1 font-mono text-[22px] font-bold text-[#FF5200]">{fmtDh(total)}</p>
            <p className="mt-0.5 text-[11px] text-[#64748B]">
              Chez {CLIENT_KRIDI.length} commerçants · à régler avant échéance.
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#FF5200]">
            <BookOpen size={20} />
          </span>
        </div>
      </Pane>

      {CLIENT_KRIDI.length === 0 && (
        <Pane className="p-4 text-center text-[12px] text-slate-500">
          Aucune dette Kridi réelle enregistrée pour ce compte.
        </Pane>
      )}

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
                    late ? "text-[#FF5200]" : "text-[#059669]",
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

      <Pane className="p-3.5">
        <h3 className="text-[13px] font-bold text-[#0F172A]">Mon profil</h3>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={user.name} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[#0F172A]">{user.name}</p>
            <p className="truncate text-[11px] text-[#64748B]">{user.email}</p>
            <p className="text-[10.5px] text-[#94A3B8]">{[user.address, user.city].filter(Boolean).join(" · ") || "Ajoute ta ville dans Mon profil"}</p>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={onProfile}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FFF1EA] py-2.5 text-[11.5px] font-bold text-[#D95F00] active:scale-[.98]"
          >
            <LogOut size={14} /> Modifier mon profil
          </button>
        </div>
      </Pane>
    </div>
  );
}

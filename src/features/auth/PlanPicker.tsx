/** Choix de formule boutique — visuel uniquement pour le paiement Premium. */
import { Check, Crown, Wallet } from "lucide-react";

export function PlanPicker({
  premium,
  onChange,
}: {
  premium: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-slate-500">Formule boutique</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={
            "flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
            (!premium
              ? "border-transparent bg-[#34D399] text-white"
              : "border-[#E9DDF2] bg-white text-[#81748A] hover:bg-[#F7F1FB]")
          }
        >
          <Wallet size={14} className="mr-1 inline" /> Free
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={
            "flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-all " +
            (premium
              ? "border-transparent bg-[#FF7A1A] text-white"
              : "border-[#E9DDF2] bg-white text-[#81748A] hover:bg-[#F7F1FB]")
          }
        >
          <Crown size={14} className="mr-1 inline" /> Premium
        </button>
      </div>

      {premium && (
        <div className="rounded-xl border border-[#FFD9B3] bg-[#FFF7ED] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-[#9A4A00]">Demande de paiement Premium</p>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#FF7A1A]">
              99 DH / mois
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-[10.5px] text-[#9A4A00]/80">
            <li className="flex items-start gap-1.5">
              <Check size={12} className="mt-0.5 shrink-0 text-[#059669]" /> Apparaître parmi les premiers
            </li>
            <li className="flex items-start gap-1.5">
              <Check size={12} className="mt-0.5 shrink-0 text-[#059669]" /> Publicité gratuite dans le réseau
            </li>
            <li className="flex items-start gap-1.5">
              <Check size={12} className="mt-0.5 shrink-0 text-[#059669]" /> Offres et statistiques prioritaires
            </li>
          </ul>
          <button
            type="button"
            disabled
            aria-disabled
            className="mt-2.5 w-full cursor-not-allowed rounded-lg bg-[#FF7A1A]/70 py-2 text-[11px] font-bold text-white opacity-80"
          >
            Payer — bientôt disponible
          </button>
        </div>
      )}
    </div>
  );
}

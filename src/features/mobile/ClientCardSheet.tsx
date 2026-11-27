/** Feuille de carte client : style identique à la carte commerçant. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CreditCard, Plus } from "lucide-react";
import { fmtDh } from "../../lib/format";
import type { PayzikCard } from "../../services/backend/payzikCards";
import { Sheet } from "./ui";

export function ClientCardSheet({
  open,
  card,
  name,
  onClose,
  onRecharge,
}: {
  open: boolean;
  card: PayzikCard | null;
  name: string;
  onClose: () => void;
  onRecharge: () => void;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!open || !card) return;
    let alive = true;
    QRCode.toDataURL(card.code, {
      margin: 1,
      width: 200,
      color: { dark: "#2E2659", light: "#FFFFFF" },
    })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => setQr(""));
    return () => { alive = false; };
  }, [open, card?.code]);

  if (!open || !card) return null;

  return (
    <Sheet open onClose={onClose} title="Ma carte PAYZIK">
      <div className="rounded-2xl bg-gradient-to-br from-[#433874] to-[#A78BFA] p-4 text-white shadow-md">
        <div className="flex items-start justify-between">
          <CreditCard size={20} className="text-white/90" />
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/85">
            PAYZIK
          </span>
        </div>
        <p className="mt-3 truncate text-[14px] font-bold">{name || "Client PAYZIK"}</p>
        <p className="font-mono text-[10.5px] text-white/60">{card.code}</p>
        <div className="mt-3 flex items-end justify-between border-t border-white/15 pt-2">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/60">Solde</p>
            <p className="font-mono text-[18px] font-bold">{fmtDh(card.balance_dh)}</p>
          </div>
          <p className="text-[10px] text-white/70">Présente en caisse</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#DFD9EF] bg-white p-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#DFD9EF] bg-white">
          {qr ? <img src={qr} alt="QR de la carte" className="h-full w-full object-contain" /> : <CreditCard size={28} className="text-[#8A7DB0]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold text-[#2E2659]">Paiement par code</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-[#6B6389]">{card.code}</p>
          <p className="mt-1 text-[10px] text-[#6B6389]">Le commerçant scanne ou saisit ce code.</p>
        </div>
      </div>

      <button
        onClick={() => { onClose(); onRecharge(); }}
        className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#433874] text-[11px] font-bold text-white"
      >
        <Plus size={14} /> Recharger la carte
      </button>
    </Sheet>
  );
}

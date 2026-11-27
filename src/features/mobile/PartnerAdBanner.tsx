/** Bandeau partenaire compact : discret, sans popup ni son, masquable par la session. */
import { ArrowUpRight, X } from "lucide-react";
import type { PartnerAd } from "../../services/backend/payzikPartnerAds";

export function PartnerAdBanner({
  ad,
  onHide,
}: {
  ad: PartnerAd;
  onHide: () => void;
}) {
  const initials = ad.company_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const open = () => {
    if (ad.cta_url) window.open(ad.cta_url, "_blank", "noopener,noreferrer");
  };

  return (
    <article className="relative overflow-hidden rounded-xl border border-[#FFE4D5] bg-white p-2.5 shadow-sm">
      <div className="flex items-center gap-2.5 pr-5">
        {ad.image_url ? (
          <img
            src={ad.image_url}
            alt={ad.company_name}
            className="h-9 w-9 shrink-0 rounded-lg border border-[#F7F1FB] bg-white object-contain p-0.5"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1E5FA] text-[11px] font-bold text-[#E91E83]">
            {initials}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#E91E83]">
              Partenaire
            </span>
            <span className="truncate text-[8px] text-[#A08BAE]">· {ad.company_name}</span>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] font-bold text-[#21152C]">{ad.title}</p>
          {ad.subtitle && (
            <p className="truncate text-[9.5px] text-[#81748A]">{ad.subtitle}</p>
          )}
        </div>

        {ad.cta_url && (
          <button
            onClick={open}
            className="flex shrink-0 items-center gap-0.5 rounded-md bg-[#F1E5FA] px-2 py-1 text-[9.5px] font-bold text-[#E91E83]"
          >
            {ad.cta_label} <ArrowUpRight size={10} />
          </button>
        )}
      </div>

      <button
        onClick={onHide}
        aria-label="Masquer cette publicité"
        className="absolute right-1 top-1 rounded p-0.5 text-[#A08BAE] hover:bg-[#F7F1FB]"
      >
        <X size={11} />
      </button>
    </article>
  );
}

/** Pub réelle Google AdSense. Rien n'est affiché sans ID de compte et bloc approuvés. */
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined;
const SLOT = import.meta.env.VITE_ADSENSE_SLOT_HOME as string | undefined;

export function GoogleAdBanner() {
  const slotRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!CLIENT || !SLOT || !slotRef.current) return;

    const loaderId = "payzik-adsense-loader";
    if (!document.getElementById(loaderId)) {
      const script = document.createElement("script");
      script.id = loaderId;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(CLIENT);
      document.head.appendChild(script);
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense n'a pas encore répondu : on ne force rien et on n'affiche rien de faux.
    }
  }, []);

  if (!CLIENT || !SLOT) return null;

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-2">
      <p className="mb-1 text-[8px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
        Publicité
      </p>
      <ins
        ref={slotRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

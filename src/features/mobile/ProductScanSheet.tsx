/** Scanner PRODUIT de la caisse — codes-barres (BarcodeDetector) avec
 *  repli sur la détection photo IA existante. Ne jamais confondre avec le
 *  scanner QR de carte client (CardScanSheet). */
import { Camera, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Store } from "../../state/store";
import { ScannerModal } from "../voice/ScannerModal";
import { Btn } from "./ui";

type DetectorResult = { rawValue: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<DetectorResult[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

function getDetectorCtor(): DetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: DetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function ProductScanSheet({
  open,
  store,
  onClose,
  onAdded,
}: {
  open: boolean;
  store: Store;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef("");
  const [phase, setPhase] = useState<"camera" | "error">("camera");
  const [message, setMessage] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setPhase("camera");
      setMessage("");
      return;
    }
    const Ctor = getDetectorCtor();
    if (!Ctor) {
      setPhase("error");
      setMessage(
        "Lecture de codes-barres indisponible sur ce navigateur. Utilisez la détection photo par l'IA.",
      );
      return;
    }
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new Ctor({
          formats: ["ean_13", "ean_8", "upc_a", "code_128", "code_39"],
        });
        timerRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            const code = codes[0]?.rawValue;
            if (!code || code === lastRef.current) return;
            lastRef.current = code;
            const product = store.products.find(
              (p) => p.barcode === code || p.id === code,
            );
            if (!product) {
              setMessage(`Code ${code} inconnu dans le stock de la boutique.`);
              window.setTimeout(() => { lastRef.current = ""; }, 1800);
              return;
            }
            store.addToCart(product.id, 1);
            onAdded(product.name);
            setMessage(`${product.name} ajouté au panier.`);
            window.setTimeout(() => { lastRef.current = ""; }, 1800);
          } catch {
            /* image pas encore lisible : on réessaie au tour suivant */
          }
        }, 700);
      } catch {
        if (alive) {
          setPhase("error");
          setMessage("Caméra refusée — autorisez l'accès dans le navigateur.");
        }
      }
    })();
    return () => { alive = false; stop(); };
  }, [open, store, stop, onAdded]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-[#160C1D]/95">
        <div className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] text-white">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60">PAYZIK</p>
            <p className="text-[15px] font-bold">Scanner les produits</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le scanner"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 active:scale-95"
          >
            <X size={19} />
          </button>
        </div>

        {phase === "camera" ? (
          <div className="relative min-h-0 flex-1 px-4">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full rounded-3xl object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-44 w-80 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(22,12,29,0.45)]">
                <span className="animate-scan-line absolute left-3 right-3 top-1/2 h-0.5 bg-[#F43F9E]" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FCEAF4] text-[#E91E83]">
              <ScanBarcode size={30} />
            </span>
            <p className="mt-4 max-w-[280px] text-[12px] leading-relaxed text-white/80">{message}</p>
          </div>
        )}

        <div className="space-y-2 px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4">
          {message && (
            <div className="animate-toast-in rounded-xl bg-white/10 px-3 py-2 text-center text-[11px] font-semibold text-white">
              {message}
            </div>
          )}
          <p className="text-center text-[10px] text-white/60">
            Codes-barres EAN/UPC des produits du stock. Le QR client sert uniquement au paiement.
          </p>
          {getDetectorCtor() === null && (
            <Btn className="w-full" onClick={() => setPhotoOpen(true)}>
              <Camera size={16} /> Détection photo IA
            </Btn>
          )}
        </div>
      </div>

      <ScannerModal
        store={store}
        open={photoOpen}
        onClose={() => { setPhotoOpen(false); setMessage(""); }}
      />
    </>
  );
}

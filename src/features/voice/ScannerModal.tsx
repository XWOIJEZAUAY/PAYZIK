import { Camera, Loader2, ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiAvailable, aiFailureMessage, classifyItems, parsePhoto, speak } from "../../services/ai";
import type { Store } from "../../state/store";
import type { Product } from "../../types";
import { Button, Modal } from "../../components/ui";

type Phase = "camera" | "thinking" | "done" | "error";

/** Vraie caméra : la photo du comptoir est envoyée à l'IA qui détecte
 *  les produits du catalogue et les ajoute au ticket. */
export function ScannerModal({
  store,
  open,
  onClose,
}: {
  store: Store;
  open: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [message, setMessage] = useState("");
  const [found, setFound] = useState<{ product: Product; qty: number }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [shot, setShot] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // démarrage / arrêt caméra
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    setPhase("camera");
    setMessage("");
    setFound([]);
    setMissing([]);
    setShot(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setPhase("error");
        setMessage("Caméra refusée — autorise la caméra dans le navigateur (🔒 barre d'adresse).");
      }
    })();
    return stopCamera;
  }, [open, stopCamera]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // image réduite (768 px max) => envoi + analyse beaucoup plus rapides
    const max = 768;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    const b64 = dataUrl.split(",")[1];
    setShot(dataUrl);
    setPhase("thinking");
    const items = await parsePhoto(b64, store.products);
    if (items === null) {
      setPhase("error");
      setMessage(
        aiAvailable()
          ? aiFailureMessage()
          : "Aucune clé IA dans payzik-pos/.env (VITE_GEMINI_API_KEY ou VITE_ANTHROPIC_API_KEY).",
      );
      return;
    }
    const { found: matched, missing: absent } = classifyItems(items, store.products);
    for (const { product, qty } of matched) store.addToCart(product.id, qty);
    setFound(matched);
    setMissing(absent);
    setPhase("done");
    if (matched.length > 0 || absent.length > 0) {
      const phrases: string[] = [];
      if (matched.length > 0) {
        const total = matched.reduce((s, f) => s + f.product.priceDh * f.qty, 0);
        const liste = matched.map((f) => `${f.qty} ${f.product.name}`).join("، ");
        phrases.push(`لقيت ${liste}. لمجموع ${total} درهم.`);
      }
      for (const name of absent)
        phrases.push(`ماكاينش ${name} ف الكاطالوگ.`);
      speak(phrases.join(" "));
      if (absent.length === 0) setTimeout(onClose, 1800);
    } else {
      setMessage("Aucun produit reconnu sur la photo. Rapproche-toi et éclaire mieux.");
    }
  }, [onClose, store]);

  return (
    <Modal open={open} onClose={onClose} title="Scanner les produits (photo → IA)">
      <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl bg-ink">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {shot && (
          <img
            src={shot}
            alt="photo capturée"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* cadre de visée */}
        <div className="pointer-events-none absolute inset-8">
          {(["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2",
             "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"] as const).map((pos) => (
            <span key={pos} className={`absolute h-7 w-7 rounded-sm border-brand ${pos}`} />
          ))}
          {phase === "thinking" && (
            <span className="absolute left-2 right-2 h-0.5 animate-scan-line rounded bg-brand shadow-[0_0_12px_#4F46E5]" />
          )}
        </div>
        {/* état */}
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
          {phase === "thinking" && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
              <Loader2 size={14} className="animate-spin" /> L'IA analyse la photo…
            </span>
          )}
          {phase === "done" && found.length > 0 && (
            <span className="animate-fade-up rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-white">
              ✓ {found.map((f) => `${f.product.name} ×${f.qty}`).join(" · ")}
            </span>
          )}
          {phase === "done" && missing.length > 0 && (
            <span className="animate-fade-up rounded-full bg-rose-500 px-4 py-1.5 text-center text-xs font-semibold text-white">
              ✗ {missing.join(", ")} — n'existe pas au catalogue
            </span>
          )}
          {(phase === "error" || (phase === "done" && found.length === 0 && missing.length === 0)) && (
            <span className="mx-4 rounded-xl bg-rose-500/90 px-4 py-1.5 text-center text-xs font-semibold text-white">
              {message}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          className="flex-1 !py-3"
          disabled={phase === "thinking"}
          onClick={capture}
        >
          {phase === "thinking" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Camera size={16} />
          )}
          Photographier & détecter
        </Button>
        {phase === "error" && (
          <Button variant="secondary" onClick={() => { setPhase("camera"); setShot(null); }}>
            <ScanBarcode size={15} /> Réessayer
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Pose les produits devant la caméra — la photo est envoyée à Gemini qui les
        reconnaît selon ton catalogue.
      </p>
    </Modal>
  );
}

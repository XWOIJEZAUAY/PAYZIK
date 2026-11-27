import { AlertCircle, Loader2, ScanLine, Wallet } from "lucide-react";
import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { PIN_THRESHOLD } from "../../lib/wallet";
import type { WalletCard } from "../../types";
import { fmtDh } from "../../lib/format";
import { Btn, Sheet } from "./ui";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const getCtor = (): BarcodeDetectorCtor | null =>
  (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;

/** Scan du QR / code-barres d'une carte PAYZIK avant tout paiement par carte.
 *  La carte est vérifiée dans la base ; une carte inconnue est refusée. */
export function CardScanSheet({
  open,
  cards,
  totalDh,
  onClose,
  onValid,
}: {
  open: boolean;
  cards: WalletCard[];
  totalDh: number;
  onClose: () => void;
  onValid: (card: WalletCard) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [card, setCard] = useState<WalletCard | null>(null);
  const [pin, setPin] = useState("");

  const findCard = useCallback(
    (raw: string) => {
      const code = raw.trim().toUpperCase();
      return cards.find((c) => c.code.toUpperCase() === code) ?? null;
    },
    [cards],
  );

  const acceptRef = useRef<(code: string) => void>(() => {});
  acceptRef.current = (code: string) => {
    if (!code.trim()) return;
    const found = findCard(code);
    if (!found) {
      setCard(null);
      setError("Cette carte n'est pas valide — elle n'existe pas dans la base.");
      return;
    }
    stop();
    setError("");
    setCard(found);
    setPin("");
  };

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    setManual("");
    setError("");
    setCard(null);
    setPin("");
    let alive = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, facingMode: "environment" },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setCameraOn(true);
        const Ctor = getCtor();
        const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const loop = async () => {
          if (!alive || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState >= 2 && v.videoWidth > 0 && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            let code: string | null = null;
            if (detector) {
              try {
                const found = await detector.detect(v);
                if (found.length && found[0].rawValue) code = found[0].rawValue.trim();
              } catch {
                /* image pas encore prête */
              }
            } else {
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const res = jsQR(image.data, image.width, image.height);
              if (res?.data) code = res.data.trim();
            }
            if (code) {
              acceptRef.current(code);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        if (alive)
          setError("Caméra indisponible — saisis le code imprimé sur la carte.");
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, attempt, stop]);

  if (!open) return null;

  const needPin = !!card?.pin && totalDh >= PIN_THRESHOLD;
  const enough = !!card && card.balanceDh >= totalDh;
  const canPay = !!card && enough && (!needPin || pin === card.pin);

  return (
    <Sheet open onClose={onClose} title="Paiement par carte PAYZIK">
      <p className="text-[11.5px] leading-relaxed text-[#6B6389]">
        Scan le QR / code-barres de la carte du client. Le solde est vérifié dans la base avant
        débit — une carte inconnue est refusée.
      </p>

      {!card && (
        <>
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#2E2659]">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-10 inset-y-6 rounded-lg border-2 border-[#433874]" />
            <div className="absolute inset-x-0 bottom-2 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-[#2E2659]">
                {cameraOn ? (
                  <>
                    <ScanLine size={12} className="text-[#433874]" /> Vise la carte…
                  </>
                ) : (
                  <>
                    <Loader2 size={12} className="animate-spin text-[#433874]" /> Caméra…
                  </>
                )}
              </span>
            </div>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              acceptRef.current(manual);
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase())}
              placeholder="Code carte (PZK-XXXX-XXXX)"
              className="h-10 min-w-0 flex-1 rounded-lg border border-[#DFD9EF] bg-[#F7F5FC] px-3 font-mono text-[11px] outline-none focus:border-[#433874]"
            />
            <Btn type="submit" variant="dark" disabled={!manual.trim()}>
              <ScanLine size={14} /> Vérifier
            </Btn>
          </form>
        </>
      )}

      {card && (
        <div className="animate-popIn mt-3 rounded-xl border border-[#DFD9EF] bg-[#F7F5FC] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#433874] shadow-sm">
              <Wallet size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold text-[#2E2659]">{card.name}</p>
              <p className="truncate font-mono text-[10px] text-[#6B6389]">{card.code}</p>
            </div>
          </div>
          <div className="mt-2 flex items-end justify-between border-t border-[#DFD9EF] pt-2">
            <span className="text-[11px] text-[#6B6389]">Solde disponible</span>
            <span className="font-mono text-[17px] font-bold text-[#059669]">
              {fmtDh(card.balanceDh)}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-[11px] text-[#6B6389]">Montant à payer</span>
            <span className="font-mono text-[13px] font-bold text-[#2E2659]">{fmtDh(totalDh)}</span>
          </div>
          {needPin && (
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="Code PIN (4 chiffres)"
              className="mt-2 h-10 w-full rounded-lg border border-[#DFD9EF] bg-white px-3 text-center font-mono text-[13px] tracking-widest outline-none focus:border-[#433874]"
            />
          )}
        </div>
      )}

      {error && (
        <p className="animate-popIn mt-3 flex items-start gap-2 rounded-lg bg-[#FCE4EE] px-3 py-2 text-[11px] font-semibold text-[#DC2626]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn
          variant="soft"
          onClick={() => {
            if (!card) onClose();
            else {
              setCard(null);
              setError("");
              setPin("");
              setManual("");
              setAttempt((n) => n + 1);
            }
          }}
        >
          {card ? "Scanner une autre" : "Annuler"}
        </Btn>
        <Btn variant="green" disabled={!canPay} onClick={() => onValid(card!)}>
          <Wallet size={14} /> Payer {fmtDh(totalDh)}
        </Btn>
      </div>
    </Sheet>
  );
}

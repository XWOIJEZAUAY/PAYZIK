import { Loader2, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button, Modal } from "../../components/ui";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const getCtor = (): BarcodeDetectorCtor | null =>
  (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;

/** Lecture du QR d'une carte PAYZIK via la caméra (API native BarcodeDetector). */
export function QrScanModal({
  open,
  onClose,
  onDetected,
  title = "Scanner la carte PAYZIK",
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    setError("");
    setManual("");
    setScanning(false);
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }
        const Ctor = getCtor();
        const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
        setScanning(true);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const loop = async () => {
          if (!alive || !videoRef.current) return;
          const video = videoRef.current;
          if (video.readyState >= 2 && video.videoWidth > 0 && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let code: string | null = null;
            if (detector) {
              try {
                const codes = await detector.detect(video);
                if (codes.length && codes[0].rawValue) code = codes[0].rawValue.trim();
              } catch {
                /* image pas encore prête */
              }
            } else {
              const res = jsQR(imageData.data, imageData.width, imageData.height);
              if (res?.data) code = res.data.trim();
            }
            if (code) {
              stop();
              onDetected(code);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        setError("Caméra refusée — autorise la caméra, ou saisis le code à la main.");
      }
    })();
    return () => {
      alive = false;
      stop();
    };
  }, [open, onDetected, stop]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-2xl bg-ink">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* cadre de visée carré */}
        <div className="pointer-events-none absolute inset-10">
          {(
            [
              "top-0 left-0 border-t-2 border-l-2",
              "top-0 right-0 border-t-2 border-r-2",
              "bottom-0 left-0 border-b-2 border-l-2",
              "bottom-0 right-0 border-b-2 border-r-2",
            ] as const
          ).map((pos) => (
            <span key={pos} className={`absolute h-8 w-8 rounded-sm border-brand ${pos}`} />
          ))}
        </div>
        {scanning && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
              <Loader2 size={14} className="animate-spin" /> Vise le QR de la carte…
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value.toUpperCase())}
          placeholder="Code carte (ex. PZK-A1B2-C3D4)"
          className="tnum h-11 flex-1 rounded-xl border bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <Button
          variant="secondary"
          disabled={!manual.trim()}
          onClick={() => onDetected(manual.trim())}
        >
          <ScanLine size={15} /> Valider
        </Button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        La caméra lit le QR de la carte ; sinon saisis le code imprimé.
      </p>
    </Modal>
  );
}

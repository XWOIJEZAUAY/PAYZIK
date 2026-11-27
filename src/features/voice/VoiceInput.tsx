import { Camera, Keyboard, Loader2, Mic, PhoneCall, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  aiAvailable,
  aiFailureMessage,
  getSpeechRecognition,
  matchProducts,
  parseVoiceAudio,
  parseVoiceText,
  providerName,
  speak,
  voiceMode,
  type SpeechRec,
  type VoiceResult,
} from "../../services/ai";
import { liveAvailable } from "../../services/ai/live";
import type { Store } from "../../state/store";
import { fmtDh } from "../../lib/format";
import type { Product } from "../../types";
import { Button, Card, cn, StatusDot } from "../../components/ui";
import { LiveVoiceModal } from "./LiveVoiceModal";

/* ---------- repli local sans IA (saisie manuelle) ---------- */
const NUMBER_WORDS: Record<string, number> = {
  un: 1, une: 1, wahed: 1, deux: 2, jouj: 2, zouj: 2, trois: 3, tlata: 3,
  quatre: 4, rab3a: 4, cinq: 5, khamsa: 5, six: 6, setta: 6,
};

export function parseUtterance(text: string, products: Product[]) {
  const norm = text.toLowerCase().replace(/[^\w\sàâéèêëîïôùûç0-9]/g, " ");
  const found: { product: Product; qty: number }[] = [];
  for (const p of products) {
    for (const alias of [...p.aliases, p.name.toLowerCase()]) {
      const idx = norm.indexOf(alias.toLowerCase());
      if (idx === -1) continue;
      let qty = 1;
      const before = norm.slice(0, idx).trim().split(/\s+/).pop() ?? "";
      const after = norm.slice(idx + alias.length).trim();
      if (/^\d+$/.test(before)) qty = parseInt(before, 10);
      else if (NUMBER_WORDS[before]) qty = NUMBER_WORDS[before];
      else {
        const m = after.match(/^x?\s*(\d+)/);
        if (m) qty = parseInt(m[1], 10);
      }
      if (!found.some((f) => f.product.id === p.id))
        found.push({ product: p, qty: Math.max(1, Math.min(qty, 99)) });
      break;
    }
  }
  return found;
}

type Phase = "idle" | "recording" | "thinking";

export function VoiceInput({
  store,
  onOpenScanner,
}: {
  store: Store;
  onOpenScanner: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [detected, setDetected] = useState<{ product: Product; qty: number }[]>([]);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
      speechRef.current?.stop();
    },
    [],
  );

  const handleResult = useCallback(
    (result: VoiceResult | null) => {
      if (!result) {
        setError(
          aiAvailable()
            ? aiFailureMessage()
            : "Aucune clé IA — ajoute VITE_GEMINI_API_KEY ou VITE_ANTHROPIC_API_KEY dans .env.",
        );
        setPhase("idle");
        return;
      }
      setTranscript(result.transcript);
      const items = matchProducts(result.items, store.products);
      setDetected(items);
      for (const { product, qty } of items) store.addToCart(product.id, qty);
      const base =
        result.reply ||
        (items.length
          ? `C'est ajouté : ${items.map((i) => `${i.qty} ${i.product.name}`).join(", ")}.`
          : "Je n'ai reconnu aucun produit du catalogue.");
      const total = items.reduce((s, i) => s + i.product.priceDh * i.qty, 0);
      const full = items.length ? `${base} Ça fait ${fmtDh(total)}.` : base;
      setReply(full);
      speak(full); // réponse orale, comme le mode vocal d'OpenAI
      setPhase("idle");
    },
    [store],
  );

  /* ---------- mode "audio" : enregistrement -> Gemini ---------- */
  const startAudioRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mime });
      if (blob.size < 1000) {
        setPhase("idle");
        return;
      }
      setPhase("thinking");
      handleResult(await parseVoiceAudio(blob, store.products));
    };
    mediaRef.current = rec;
    rec.start();
    setPhase("recording");
  }, [handleResult, store.products]);

  /* ---------- mode "speech" : navigateur transcrit -> Claude ---------- */
  const startSpeech = useCallback(() => {
    const rec = getSpeechRecognition()!;
    speechRef.current = rec;
    let heard = "";
    rec.lang = "fr-FR"; // le navigateur transcrit ; Claude comprend le darija translittéré
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      heard = Array.from({ length: e.results.length })
        .map((_, i) => e.results[i][0].transcript)
        .join(" ")
        .trim();
      setTranscript(heard);
    };
    rec.onend = async () => {
      if (!heard) {
        setPhase("idle");
        setError("Rien entendu — réessaie en parlant plus fort.");
        return;
      }
      setPhase("thinking");
      handleResult(await parseVoiceText(heard, store.products));
    };
    rec.onerror = () => {
      setPhase("idle");
      setError("Micro refusé ou indisponible — autorise le microphone (🔒 barre d'adresse).");
    };
    rec.start();
    setPhase("recording");
  }, [handleResult, store.products]);

  const start = useCallback(async () => {
    setError("");
    setTranscript("");
    setReply("");
    setDetected([]);
    const mode = voiceMode();
    try {
      if (mode === "audio") await startAudioRecording();
      else if (mode === "speech") startSpeech();
      else
        setError(
          aiAvailable()
            ? "Ce navigateur ne supporte pas la dictée — utilise Chrome, ou ajoute une clé Gemini."
            : "Aucune clé IA — ajoute VITE_GEMINI_API_KEY ou VITE_ANTHROPIC_API_KEY dans .env.",
        );
    } catch {
      setError("Micro refusé — autorise le microphone dans le navigateur (🔒 barre d'adresse).");
      setPhase("idle");
    }
  }, [startAudioRecording, startSpeech]);

  const stop = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    speechRef.current?.stop();
  }, []);

  const provider = providerName();

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <button
          onClick={phase === "recording" ? stop : start}
          disabled={phase === "thinking"}
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
            phase === "recording"
              ? "bg-orange text-night shadow-glow"
              : "bg-navy text-white shadow-[0_6px_20px_rgba(138,110,221,0.3)] hover:bg-navy-soft",
            phase === "thinking" && "opacity-70",
          )}
        >
          {phase === "recording" ? (
            <Square size={20} className="fill-white" />
          ) : phase === "thinking" ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <Mic size={22} />
          )}
          {phase === "recording" && (
            <span className="absolute inset-0 animate-ping rounded-2xl bg-rose-400/40" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink">Commande vocale IA</p>
            <span className="text-[11px] font-medium text-slate-400">
              Darija / Français
            </span>
            {provider ? (
              <StatusDot tone="emerald">{provider} connecté</StatusDot>
            ) : (
              <StatusDot tone="rose">Clé IA manquante</StatusDot>
            )}
          </div>

          {phase === "recording" ? (
            <div className="mt-1.5 flex h-6 items-end gap-[3px]">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[3px] origin-bottom animate-wave rounded-full bg-rose-500"
                  style={{
                    height: `${8 + ((i * 37) % 16)}px`,
                    animationDelay: `${(i % 6) * 0.12}s`,
                  }}
                />
              ))}
              <span className="ml-2 text-xs font-medium text-slate-400">
                {transcript ? `« ${transcript} »` : "Parle… puis appuie sur ■"}
              </span>
            </div>
          ) : phase === "thinking" ? (
            <p className="mt-1 text-sm font-medium text-brand">
              L'IA cherche tes produits…
            </p>
          ) : transcript || reply ? (
            <div className="mt-1 space-y-0.5">
              {transcript && (
                <p className="truncate text-sm text-slate-500">🗣️ « {transcript} »</p>
              )}
              {reply && (
                <p className="truncate text-sm font-semibold text-emerald-700">
                  🤖 {reply}
                </p>
              )}
            </div>
          ) : error ? (
            <p className="mt-1 text-sm font-medium text-rose-600">{error}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              Appuie et dis : « jouj Sidi Ali o wahed atay »
            </p>
          )}

          {detected.length > 0 && phase === "idle" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {detected.map(({ product, qty }) => (
                <span
                  key={product.id}
                  className="animate-fade-up inline-flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1 text-xs font-bold text-brand"
                >
                  {product.emoji} {product.name}
                  <span className="rounded bg-brand px-1 text-[10px] text-white">
                    ×{qty}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {liveAvailable() && (
            <Button
              variant="primary"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => setLiveOpen(true)}
            >
              <PhoneCall size={14} /> Conversation Live
            </Button>
          )}
          <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={onOpenScanner}>
            <Camera size={14} /> Scanner caméra
          </Button>
          <Button
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => setManual((m) => !m)}
          >
            <Keyboard size={14} /> Saisie manuelle
          </Button>
        </div>
      </div>

      {manual && (
        <form
          className="mt-3 flex gap-2 border-t pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const text = manualText.trim();
            if (!text) return;
            setManualText("");
            if (aiAvailable()) {
              setPhase("thinking");
              handleResult(await parseVoiceText(text, store.products));
            } else {
              setTranscript(text);
              const items = parseUtterance(text, store.products);
              setDetected(items);
              for (const { product, qty } of items) store.addToCart(product.id, qty);
            }
          }}
        >
          <input
            autoFocus
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="2 sidi ali, 1 sukkar…"
            className="h-10 flex-1 rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
          <Button variant="primary" type="submit">
            Ajouter
          </Button>
        </form>
      )}

      <LiveVoiceModal store={store} open={liveOpen} onClose={() => setLiveOpen(false)} />
    </Card>
  );
}

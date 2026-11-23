import {
  Banknote,
  Camera,
  Loader2,
  Mic,
  Minus,
  Phone,
  PhoneOff,
  Plus,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDh } from "../../lib/format";
import {
  aiAvailable,
  aiFailureMessage,
  getSpeechRecognition,
  matchProducts,
  parseVoiceAudio,
  parseVoiceText,
  speak,
  voiceMode,
  type SpeechRec,
  type VoiceResult,
} from "../../services/ai";
import { LiveSession } from "../../services/ai/live";
import { createLiveToolHandlers } from "../../services/ai/liveTools";


import type { Store } from "../../state/store";
import type { Product } from "../../types";
import { getAiLang, setAiLang, type AiLang } from "../../lib/aiLang";
import { Button, cn } from "../../components/ui";
import { BoltIcon } from "../../components/brand/Logo";
import { CartPanel } from "./CartPanel";
import { parseUtterance } from "../voice/VoiceInput";

/* ------------------------------------------------------------------ messages */
type ChatMsg = {
  id: string;
  role: "user" | "agent";
  text?: string;
  kind?: "info" | "success" | "error";
  /** produits cités par l'agent — la quantité affichée est celle du panier en direct */
  products?: { productId: string }[];
  /** bulle partielle du mode live (transcription en cours) */
  partial?: boolean;
};

let seq = 0;
const mid = () => `m-${++seq}-${Date.now()}`;

/* ------------------------------------------------------------------ composant */
export function AgentChat({
  store,
  onOpenScanner,
}: {
  store: Store;
  onOpenScanner: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [phase, setPhase] = useState<"idle" | "recording" | "thinking">("idle");
  const [liveState, setLiveState] = useState<"off" | "connecting" | "listening" | "speaking" | "error">("off");
  const [aiLang, setAiLangState] = useState<AiLang>(getAiLang());
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptItems, setReceiptItems] = useState<{ productId: string; qty: number }[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const liveRef = useRef<LiveSession | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, phase]);

  useEffect(
    () => () => {
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
      speechRef.current?.stop();
    },
    [],
  );

  const say = useCallback((m: Omit<ChatMsg, "id">) => {
    setMsgs((prev) => [...prev.filter((x) => !x.partial), { ...m, id: mid() }]);
  }, []);

  /* upsertPartial supprimé (pas de transcription écrite) */

  const stopLive = useCallback(
    (silent = false) => {
      liveRef.current?.stop();
      liveRef.current = null;
      setLiveState("off");
      if (!silent) say({ role: "agent", kind: "info", text: "Conversation live terminée." });
    },
    [say],
  );

  const startLive = useCallback(() => {
    if (liveRef.current) return;
    setLiveState("connecting");
    const handlers = createLiveToolHandlers(() => storeRef.current);
    const session = new LiveSession(storeRef.current.products, {
      onReady: () => setLiveState("listening"),
      onActivity: (a) => setLiveState(a),
      onUserTranscript: () => {},
      onAssistantTranscript: () => {},
      onToolCall: async (call) => {
        const handler = handlers[call.name];
        if (!handler) return { ok: false, error: `unknown tool ${call.name}` };
        const outcome = handler(call.args);
        if (outcome.products?.length) {
          say({
            role: "agent",
            products: outcome.products.map((p) => ({ productId: p.productId })),
          });
          if (call.name === "getCart") {
            setReceiptItems(outcome.products.map((p) => ({ productId: p.productId, qty: p.qty })));
            setReceiptOpen(true);
          }
        } else if (outcome.message) {
          say({ role: "agent", text: outcome.message });
        }
        return outcome.data;
      },
      onError: (m) => {
        setLiveState("error");
        say({ role: "agent", kind: "error", text: `Live : ${m}` });
      },
      onClose: () => {
        setLiveState((s) => (s === "error" ? s : "off"));
        liveRef.current = null;
      },
    });
    liveRef.current = session;
    void session.start();
  }, [say]);

  const toggleLive = useCallback(() => {
    if (liveRef.current) stopLive();
    else startLive();
  }, [startLive, stopLive]);

  /* mode live supprimé */

  /* ================================================================
   *  DICTÉE ONE-SHOT (micro hors live) + texte
   *  ================================================================ */
  const handleVoiceResult = useCallback(
    (result: VoiceResult | null) => {
      if (!result) {
        say({
          role: "agent",
          kind: "error",
          text: aiAvailable()
            ? aiFailureMessage()
            : "Aucune clé IA — ajoute VITE_GEMINI_API_KEY ou VITE_ANTHROPIC_API_KEY dans .env, ou écris la commande.",
        });
        setPhase("idle");
        return;
      }
      const items = matchProducts(result.items, storeRef.current.products);
      for (const { product, qty } of items) storeRef.current.addToCart(product.id, qty);
      // Feuille/papier : affiche la liste complète après ajout.
      if (items.length) {
        setReceiptItems(items.map((i) => ({ productId: i.product.id, qty: i.qty })));
        setReceiptOpen(true);
      }
      const base =
        result.reply ||
        (items.length
          ? `C'est ajouté : ${items.map((i) => `${i.qty} × ${i.product.name}`).join(", ")}.`
          : "Je n'ai reconnu aucun produit du catalogue.");
      const cartTotal = items.reduce((s, i) => s + i.product.priceDh * i.qty, 0);
      say({
        role: "agent",
        text: items.length ? `${base} Ça fait ${fmtDh(cartTotal)}.` : base,
        products: items.map((i) => ({ productId: i.product.id })),
      });
      speak(items.length ? `${base} Ça fait ${fmtDh(cartTotal)}.` : base);
      setPhase("idle");
    },
    [say],
  );

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
      const result = await parseVoiceAudio(blob, storeRef.current.products);
      setMsgs((prev) => [
        ...prev,
        { id: mid(), role: "user", text: result?.transcript || "(dictée vocale)" },
      ]);
      handleVoiceResult(result);
    };
    mediaRef.current = rec;
    rec.start();
    setPhase("recording");
  }, [handleVoiceResult]);

  const startSpeech = useCallback(() => {
    const rec = getSpeechRecognition()!;
    speechRef.current = rec;
    let heard = "";
    rec.lang = "fr-FR";
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
        say({ role: "agent", kind: "error", text: "Rien entendu — réessaie en parlant plus fort." });
        return;
      }
      setPhase("thinking");
      setMsgs((prev) => [...prev, { id: mid(), role: "user", text: `« ${heard} »` }]);
      handleVoiceResult(await parseVoiceText(heard, storeRef.current.products));
    };
    rec.onerror = () => {
      setPhase("idle");
      say({
        role: "agent",
        kind: "error",
        text: "Micro refusé ou indisponible — autorise le microphone (🔒 barre d'adresse).",
      });
    };
    rec.start();
    setPhase("recording");
  }, [handleVoiceResult, say]);

  const stopVoice = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    speechRef.current?.stop();
  }, []);

  const toggleMic = useCallback(async () => {
    if (phase === "recording") {
      stopVoice();
      return;
    }
    setTranscript("");
    const mode = voiceMode();
    try {
      if (mode === "audio") await startAudioRecording();
      else if (mode === "speech") startSpeech();
      else
        say({
          role: "agent",
          kind: "error",
          text: aiAvailable()
            ? "Ce navigateur ne supporte pas la dictée — utilise Chrome, ou écris la commande."
            : "Aucune clé IA — ajoute VITE_GEMINI_API_KEY ou VITE_ANTHROPIC_API_KEY dans .env.",
        });
    } catch {
      say({
        role: "agent",
        kind: "error",
        text: "Micro refusé — autorise le microphone dans le navigateur (🔒 barre d'adresse).",
      });
    }
  }, [phase, say, startAudioRecording, startSpeech, stopVoice]);

  const sendText = useCallback(async () => {
    const text = draft.trim();
    if (!text || phase === "thinking") return;
    setDraft("");
    setMsgs((prev) => [...prev.filter((x) => !x.partial), { id: mid(), role: "user", text }]);
    // En mode appel (live) : le texte part dans la session vocale, l'IA répond à voix haute.
    if (liveRef.current) {
      liveRef.current.sendText(text);
      return;
    }
    // Affichage feuille/papier sur demande de total. L'IA annonce le total (pas le robot).
    if (/total|majmou|khlas|ticket|liste/i.test(text)) {
      setReceiptItems(storeRef.current.cart.map((l) => ({ productId: l.productId, qty: l.qty })));
      setReceiptOpen(true);
    }
    // (mode live supprimé)
    setPhase("thinking");
    if (aiAvailable()) {
      handleVoiceResult(await parseVoiceText(text, storeRef.current.products));
    } else {
      const items = parseUtterance(text, storeRef.current.products);
      for (const { product, qty } of items) storeRef.current.addToCart(product.id, qty);
      const total = items.reduce((s, i) => s + i.product.priceDh * i.qty, 0);
      say({
        role: "agent",
        kind: items.length ? "info" : "error",
        text: items.length
          ? `Ajouté : ${items.map((i) => `${i.qty} × ${i.product.name}`).join(", ")}. Ça fait ${fmtDh(total)}.`
          : "Je n'ai reconnu aucun produit — réessaie avec un autre nom.",
        products: items.map((i) => ({ productId: i.product.id })),
      });
      setPhase("idle");
    }
  }, [draft, handleVoiceResult, phase, say]);

  const clearAll = useCallback(() => {
    store.clearCart();
    say({ role: "agent", kind: "info", text: "Commande vidée. Je t'écoute à nouveau." });
  }, [say, store]);

  const liveOn = liveState !== "off" && liveState !== "error";

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* ---------------- fil de discussion (GRANDE surface de l'agent) ---------------- */}
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {/* ---------- écran d'accueil : grand message d'identité PAYZIK ---------- */}
        {msgs.length === 0 && phase === "idle" && (
          <div className="flex min-h-[70%] flex-col items-center justify-center py-16 text-center">
            <BoltIcon size={72} />
            <h1 className="mt-7 max-w-2xl text-4xl font-black leading-tight tracking-tight text-ink sm:text-5xl">
              Salam ! Ta caisse est prête.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] font-medium leading-relaxed text-slate-500">
              Parle en darija ou écris ta commande — PAYZIK prépare le ticket, tu
              valides, tu encaisses.
            </p>
            <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.25em] text-teal-deep">
              Voix · Texte · Scan
            </p>
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <UserBubble key={m.id} text={m.text ?? ""} partial={m.partial} />
          ) : (
            <AgentBubble key={m.id} msg={m} store={store} />
          ),
        )}
        {phase === "thinking" && (
          <div className="flex items-center gap-2.5 text-sm font-medium text-slate-400">
            <BoltIcon size={22} className="animate-pulse" />
            L'IA cherche tes produits…
          </div>
        )}
        {phase === "recording" && (
          <div className="flex items-center gap-2.5 text-sm font-medium text-rose-500">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-sm text-white">
              <Square size={12} className="fill-white" />
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" />
            </span>
            {transcript ? `« ${transcript} »` : "Je t'écoute… parle, puis ■"}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ---------------- barre commande : total + encaisser ---------------- */}
      <div className="border-t bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Ticket #{store.ticketNo} · {store.cart.length} article
              {store.cart.length > 1 ? "s" : ""}
            </p>
            <p className="tnum text-2xl font-black leading-tight text-ink">
              {fmtDh(store.cartTotal)}
            </p>
          </div>
          {store.cart.length > 0 && (
            <Button variant="ghost" className="!px-3 text-xs" onClick={clearAll}>
              <Trash2 size={14} /> Vider
            </Button>
          )}
          <Button
            variant="primary"
            disabled={store.cart.length === 0}
            className="!px-5 !py-3"
            onClick={() => setCheckoutOpen(true)}
          >
            <Banknote size={17} /> Encaisser
          </Button>
        </div>
      </div>

      {/* ---------------- composer : micro + texte + live ---------------- */}
      <div className="border-t bg-white p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            disabled={phase === "thinking"}
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
              phase === "recording"
                ? "bg-teal text-navy shadow-glow"
                : "bg-navy text-white shadow-[0_6px_20px_rgba(1,204,182,0.3)] hover:bg-navy-soft",
              phase === "thinking" && "opacity-70",
            )}
            title="Dicte la commande"
          >
            {phase === "recording" ? (
              <Square size={17} className="fill-navy" />
            ) : phase === "thinking" ? (
              <Loader2 size={19} className="animate-spin" />
            ) : (
              <Mic size={19} />
            )}
            {/* mode live supprimé */}
          </button>

          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendText();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Écris ta commande…"
              className="h-11 flex-1 rounded-2xl border bg-slate-50 px-4 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
            <Button
              variant="primary"
              type="submit"
              disabled={!draft.trim()}
              className="!h-11 !w-11 !rounded-2xl !p-0 !bg-teal !text-navy hover:!bg-teal-glow"
              title="Envoyer"
            >
              <Send size={17} />
            </Button>
          </form>

          <button
            onClick={() => {
              const next: AiLang = aiLang === "darija" ? "tachelhit" : "darija";
              setAiLang(next);
              setAiLangState(next);
            }}
            className="flex h-11 shrink-0 items-center justify-center rounded-2xl border border-navy/15 bg-white px-3 text-xs font-bold text-navy transition-colors hover:bg-accent-soft hover:text-teal-deep"
            title="Changer la langue de l'IA avant l'appel"
          >
            {aiLang === "darija" ? "Darija" : "Tachelhit"}
          </button>
          <button
            onClick={onOpenScanner}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-navy/15 bg-white text-navy transition-colors hover:bg-accent-soft hover:text-teal-deep"
            title="Scanner les produits à la caméra"
          >
            <Camera size={18} />
          </button>
          <button onClick={toggleLive} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal/40 bg-white text-teal-deep hover:bg-accent-soft">{liveOn ? <PhoneOff size={18} /> : <Phone size={18} />}</button>
        </div>
        {/* mode live supprimé */}
      </div>

      {/* ---------------- feuille / papier : liste complète sur demande de total ---------------- */}
      {receiptOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-[fade-up_.2s_ease-out]"
            onClick={() => setReceiptOpen(false)}
          />
          <div
            className="relative w-full max-w-sm origin-top animate-[paperUnfold_.55s_cubic-bezier(.2,.8,.2,1)_both] rounded-sm bg-cream p-5 text-ink shadow-[0_20px_60px_rgba(10,34,48,0.35)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(10,34,48,0.06) 23px, rgba(10,34,48,0.06) 24px)",
            }}
          >
            <button
              onClick={() => setReceiptOpen(false)}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white shadow-md hover:bg-slate-800"
            >
              <X size={14} />
            </button>
            <div className="mb-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                PAYZIK · Ticket
              </p>
              <p className="mt-1 text-lg font-black text-ink">Total</p>
            </div>
            <div className="space-y-2">
              {receiptItems.map(({ productId, qty }) => {
                const p = store.products.find((x) => x.id === productId);
                if (!p) return null;
                return (
                  <div
                    key={productId}
                    className="flex items-center gap-2 animate-[slide-in-right_.3s_ease-out_both]"
                  >
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.name}
                        className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
                        {p.emoji}
                      </span>
                    )}
                    <span className="flex-1 truncate text-[13px] font-semibold text-ink">
                      {p.name}
                    </span>
                    <span className="tnum text-[12px] text-slate-500">×{qty}</span>
                    <span className="tnum text-[13px] font-black text-ink">
                      {fmtDh(p.priceDh * qty)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 border-t-2 border-dashed border-slate-300 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="tnum text-lg font-black text-ink">
                  {fmtDh(
                    receiptItems.reduce((s, { productId, qty }) => {
                      const p = store.products.find((x) => x.id === productId);
                      return s + (p ? p.priceDh * qty : 0);
                    }, 0),
                  )}
                </span>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
            </p>
          </div>
        </div>
      )}

      {/* ---------------- tiroir encaissement (ticket + paiement) ---------------- */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setCheckoutOpen(false)}
          />
          <div className="relative flex h-full animate-fade-up flex-col bg-white shadow-pop">
            <button
              onClick={() => setCheckoutOpen(false)}
              className="absolute -left-11 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md hover:text-slate-800"
            >
              <X size={18} />
            </button>
            <CartPanel store={store} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ bulles */
function UserBubble({ text, partial }: { text: string; partial?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "animate-fade-up max-w-[80%] rounded-3xl rounded-br-lg bg-brand px-4 py-2.5 text-[14px] font-medium leading-snug text-white shadow-sm",
          partial && "opacity-60",
        )}
      >
        {text}
      </div>
    </div>
  );
}

function AgentBubble({ msg, store }: { msg: ChatMsg; store: Store }) {
  const tone =
    msg.kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : msg.kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border bg-white text-ink";
  return (
    <div className="flex items-start gap-2.5">
      <BoltIcon size={20} className="mt-1" />
      <div className="min-w-0 max-w-[85%] space-y-2">
        {msg.text && (
          <div
            className={cn(
              "animate-fade-up rounded-3xl rounded-tl-lg px-4 py-2.5 text-[14px] font-medium leading-snug shadow-sm",
              tone,
              msg.partial && "opacity-60",
            )}
          >
            {msg.text}
          </div>
        )}
        {msg.products && msg.products.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {msg.products.map(({ productId }) => (
              <ProductRow key={productId} productId={productId} store={store} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Carte-produit DANS la discussion : grande image visible, qté courante, +/-, suppression, avec animations avancées. */
function ProductRow({ productId, store }: { productId: string; store: Store }) {
  const product = store.products.find((p) => p.id === productId);
  const line = store.cart.find((l) => l.productId === productId);
  if (!product) return null;
  const qty = line?.qty ?? 0;
  const low = product.stock > 0 && qty > product.stock;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white p-3 shadow-card transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-pop",
        "animate-[popIn_0.45s_cubic-bezier(0.34,1.56,0.64,1)_both]",
        qty === 0 && "opacity-50 grayscale",
        low && "border-amber-300 bg-amber-50/60",
      )}
    >
      {/* lueur néon au survol */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(1,204,182,0.25), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-2">
        <div className="relative">
          <ProductThumbLite product={product} />
          {qty > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-teal text-[11px] font-black text-navy shadow-glow animate-[pulse_1.6s_ease-in-out_infinite]">
              {qty}
            </span>
          )}
        </div>
        <div className="w-full text-center">
          <p className="truncate text-[13px] font-bold text-ink">{product.name}</p>
          <p className="tnum text-[11px] text-slate-400">
            {fmtDh(product.priceDh)} / u
            {qty === 0 ? " · retiré" : low ? ` · ⚠️ stock ${product.stock}` : ""}
          </p>
        </div>
        {qty > 0 ? (
          <>
            <span className="tnum text-base font-black text-ink">
              {fmtDh(product.priceDh * qty)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => store.setQty(productId, qty - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 active:scale-90"
              >
                <Minus size={14} />
              </button>
              <span className="tnum w-7 text-center text-sm font-bold">{qty}</span>
              <button
                onClick={() => store.setQty(productId, qty + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 active:scale-90"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => store.setQty(productId, 0)}
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 active:scale-90"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        ) : (
          <Button
            variant="secondary"
            className="!px-3 !py-1.5 text-xs active:scale-95"
            onClick={() => store.addToCart(productId)}
          >
            <Plus size={13} /> Remettre
          </Button>
        )}
      </div>
    </div>
  );
}

function ProductThumbLite({ product }: { product: Product }) {
  if (product.image) {
    return (
      <img
        src={product.image}
        alt={product.name}
        className="h-28 w-28 shrink-0 rounded-2xl object-cover ring-2 ring-inset ring-slate-200/60 transition-transform duration-300 group-hover:scale-105"
      />
    );
  }
  return (
    <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-5xl ring-2 ring-inset ring-slate-200/60">
      {product.emoji}
    </span>
  );
}

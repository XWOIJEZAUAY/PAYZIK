/** Assistant IA du client — voix + texte, lecture seule des données publiques.
 *  Aucune action de caisse, aucun encaissement, aucun paiement simulé. */
import {
  ArrowDownToLine,
  Check,
  Clock3,
  Loader2,
  Mic,
  PhoneOff,
  SendHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../components/ui";
import { fmtDh } from "../../lib/format";
import {
  LiveSession,
  liveAvailable,
  type LiveMode,
  type LiveSessionCallbacks,
  type ToolCall,
} from "../../services/ai/live";
import { Ringtone } from "../../services/ai/ringtone";
import {
  listPublicProducts,
  type CloudProduct,
  type PayzikCard,
} from "../../services/backend/payzikCards";
import type { SpendingSummary } from "../../services/backend/payzikSpending";
import type { Category, Establishment, Product } from "../../types";

type Msg = { id: string; role: "user" | "ai" | "tool"; text: string };
type Outcome = Record<string, unknown> & { message?: string };
type Status = "connecting" | "listening" | "speaking" | "error";

const CL_CLIENT: LiveMode = "client";

export function ClientAgentModal({
  open,
  onClose,
  name,
  card,
  spending,
  shops,
  onRecharge,
  onHistory,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  card: PayzikCard | null;
  spending: SpendingSummary;
  shops: Establishment[];
  onRecharge: () => void;
  onHistory: () => void;
  onPay: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [products, setProducts] = useState<CloudProduct[]>([]);
  const sessionRef = useRef<LiveSession | null>(null);
  const ringRef = useRef<Ringtone | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typedAtRef = useRef(0);
  const partialRef = useRef<{ user?: string; ai?: string }>({});
  const cardRef = useRef(card);
  const spendingRef = useRef(spending);
  const shopsRef = useRef(shops);
  cardRef.current = card;
  spendingRef.current = spending;
  shopsRef.current = shops;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMsgs([]);
    setError("");
    setStatus("connecting");
    partialRef.current = {};

    const addMsg = (role: Msg["role"], text: string) =>
      setMsgs((prev) => [...prev, { id: `m-${Date.now()}-${prev.length}`, role, text }]);

    const upsertPartial = (role: "user" | "ai", text: string, done: boolean) => {
      const pid = `p-${role}`;
      setMsgs((prev) => {
        const existing = prev.find((m) => m.id === pid);
        if (done) {
          partialRef.current[role] = undefined;
          if (existing)
            return prev.map((m) =>
              m.id === pid ? { ...m, id: `d-${Date.now()}-${Math.random()}` } : m,
            );
          return [...prev, { id: `d-${Date.now()}-${Math.random()}`, role, text }];
        }
        partialRef.current[role] = text;
        if (existing) return prev.map((m) => (m.id === pid ? { ...m, text } : m));
        return [...prev, { id: pid, role, text }];
      });
    };

    const startSession = (cloud: CloudProduct[]) => {
      if (!alive) return;
      const catalog: Product[] = cloud.map((p) => ({
        id: p.id,
        name: p.name,
        priceDh: Number(p.price_dh) || 0,
        stock: Number(p.stock) || 0,
        category: (p.category as Category) || "Épicerie",
        emoji: p.emoji || "🧺",
        aliases: Array.isArray(p.aliases) ? p.aliases : [],
        image: p.image || undefined,
      }));

      const toolHandlers: Record<string, (args: Record<string, unknown>) => Outcome> = {
        getProducts: (args) => {
          const q = String(args.query ?? "").toLowerCase().trim();
          const found = (q ? cloud.filter((p) => p.name.toLowerCase().includes(q)) : cloud).slice(0, 20);
          const shopNames = new Map(shopsRef.current.map((s) => [s.id, s.name]));
          const items = found.map((p) => ({
            name: p.name,
            priceDh: Number(p.price_dh) || 0,
            shop: (p.shop_id ? shopNames.get(p.shop_id) : undefined) ?? "Boutique du réseau",
          }));
          return {
            ok: true,
            products: items,
            message: items.length
              ? items.map((i) => `${i.name} ${fmtDh(i.priceDh)} — ${i.shop}`).join(" · ")
              : "Aucun produit trouvé avec ce mot-clé.",
          };
        },
        getShops: () => {
          const list = shopsRef.current.map((s) => s.name);
          return {
            ok: true,
            shops: list,
            message: list.length ? `Boutiques : ${list.join(", ")}` : "Aucune boutique visible.",
          };
        },
        getBalance: () => {
          const c = cardRef.current;
          return {
            ok: true,
            balanceDh: c?.balance_dh ?? 0,
            code: c?.code ?? null,
            message: c
              ? `Votre carte ${c.code} : ${fmtDh(c.balance_dh)} derhem disponibles.`
              : "Vous n'avez pas encore de carte PAYZIK.",
          };
        },
        getSpending: () => {
          const s = spendingRef.current;
          return {
            ok: true,
            spentMonth: s.spentMonth,
            spentAll: s.spentAll,
            toppedAll: s.toppedAll,
            monthCount: s.monthCount,
            message: `Ce mois : ${fmtDh(s.spentMonth)} derhem en ${s.monthCount} opérations. Total dépensé : ${fmtDh(s.spentAll)} derhem.`,
          };
        },
        getHelp: () => ({
          ok: true,
          message:
            "Pour payer, appuie sur « Payer » puis choisis la boutique. Pour ajouter de l'argent, appuie sur « Recharger ». Pour voir tes mouvements, appuie sur « Historique ». Je ne peux pas effectuer ces actions à ta place.",
        }),
      };

      const ring = new Ringtone();
      ringRef.current = ring;
      ring.start();

      const callbacks: LiveSessionCallbacks = {
        onReady: () => {
          ring.stop();
          ring.blip("pickup");
          setStatus("listening");
        },
        onActivity: (a) => setStatus(a),
        onUserTranscript: (t) => {
          if (Date.now() - typedAtRef.current < 2500) return;
          upsertPartial("user", t, false);
        },
        onAssistantTranscript: (t) => upsertPartial("ai", t, false),
        onToolCall: async (call: ToolCall) => {
          const handler = toolHandlers[call.name];
          if (!handler) {
            addMsg("tool", `Outil indisponible : ${call.name}`);
            return { ok: false, error: `unknown tool ${call.name}` };
          }
          const outcome = handler(call.args);
          if (outcome.message) addMsg("tool", outcome.message);
          return outcome;
        },
        onError: (m) => {
          ring.stop();
          setError(m);
          setStatus("error");
        },
        onClose: () => {
          ring.stop();
          setStatus((st) => (st === "error" ? st : "error"));
        },
      };

      const session = new LiveSession(catalog, callbacks, name || "Client", CL_CLIENT);
      sessionRef.current = session;
      void session.start();
    };

    (async () => {
      const res = await listPublicProducts();
      if (!alive) return;
      const cloud = res.ok ? res.data : [];
      setProducts(cloud);
      if (!res.ok) setError("Catalogue indisponible pour l'instant.");
      if (!liveAvailable()) {
        setError("Clé Gemini manquante dans .env");
        setStatus("error");
        return;
      }
      startSession(cloud);
    })();

    return () => {
      alive = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
      ringRef.current?.dispose();
      ringRef.current = null;
    };
  }, [open, name]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  if (!open) return null;

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    typedAtRef.current = Date.now();
    setMsgs((prev) => [...prev, { id: `t-${Date.now()}`, role: "user", text }]);
    sessionRef.current?.sendText(text);
    setTyped("");
  };

  const hangup = () => {
    ringRef.current?.stop();
    ringRef.current?.blip("hangup");
    sessionRef.current?.stop();
    onClose();
  };

  const statusLabel =
    status === "connecting"
      ? "Connexion à l'assistant…"
      : status === "speaking"
        ? "PAYZIK parle…"
        : status === "error"
          ? "Interrompu"
          : "Je t'écoute — parle librement";

  const quick = (cb: () => void) => {
    hangup();
    cb();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center">
      <div className="animate-fade-up flex h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-ink shadow-2xl sm:h-[82vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-colors duration-300",
                status === "speaking"
                  ? "bg-[#34D399]"
                  : status === "error"
                    ? "bg-rose-500"
                    : "bg-[#8136A8]",
              )}
            >
              {status === "connecting" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : status === "error" ? (
                <PhoneOff size={15} />
              ) : (
                <Mic size={16} />
              )}
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Assistant client PAYZIK</p>
              <p
                className={cn(
                  "text-xs",
                  status === "error" && error ? "text-rose-500" : "text-slate-400",
                )}
              >
                {status === "error" && error ? error : statusLabel}
              </p>
            </div>
          </div>
          <button
            onClick={hangup}
            title="Fermer l'assistant"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={listRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1E5FA] text-[#8136A8]">
                <Mic size={26} />
              </span>
              <p className="max-w-[17rem] text-sm text-slate-400">
                Parle ou écris : « ch7al f karti ? », « chnou kayn ? », « qui vend du lait ? »…
              </p>
              <p className="text-[10px] text-slate-400">
                {products.length} produit{products.length > 1 ? "s" : ""} public{products.length > 1 ? "s" : ""} disponible{products.length > 1 ? "s" : ""}.
              </p>
            </div>
          )}

          {msgs.map((m) =>
            m.role === "tool" ? (
              <div key={m.id} className="animate-fade-up flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669]">
                  <Check size={12} />
                </span>
                <span className="text-xs font-semibold text-slate-500">{m.text}</span>
              </div>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "animate-fade-up max-w-[85%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-[#8136A8] text-white"
                    : "bg-[#F7F1FB] text-[#21152C]",
                )}
              >
                {m.text}
              </div>
            ),
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t px-4 pt-3">
          <button
            onClick={() => quick(onRecharge)}
            className="flex flex-col items-center gap-1 rounded-xl border border-[#E9DDF2] py-2 text-[10px] font-bold text-[#8136A8] active:scale-[.98]"
          >
            <ArrowDownToLine size={15} /> Recharger
          </button>
          <button
            onClick={() => quick(onHistory)}
            className="flex flex-col items-center gap-1 rounded-xl border border-[#E9DDF2] py-2 text-[10px] font-bold text-[#8136A8] active:scale-[.98]"
          >
            <Clock3 size={15} /> Historique
          </button>
          <button
            onClick={() => quick(onPay)}
            className="flex flex-col items-center gap-1 rounded-xl border border-[#E9DDF2] py-2 text-[10px] font-bold text-[#8136A8] active:scale-[.98]"
          >
            <Wallet size={15} /> Payer
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendTyped();
            }}
            placeholder="Écris ta question…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#E9DDF2] bg-[#FDF9FE] px-3 text-[12px] outline-none focus:border-[#8136A8]"
          />
          <button
            onClick={sendTyped}
            disabled={!typed.trim()}
            aria-label="Envoyer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8136A8] text-white disabled:opacity-40"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
        <p className="pb-3 text-center text-[9.5px] text-slate-400">
          Assistant en lecture seule — aucune action financière n'est exécutée par l'IA.
        </p>
      </div>
    </div>
  );
}

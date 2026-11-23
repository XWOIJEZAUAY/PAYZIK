import {
  Banknote,
  BookOpen,
  Check,
  CreditCard,
  Loader2,
  Mic,
  PhoneOff,
  SendHorizontal,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchProducts } from "../../services/ai";
import { LiveSession, liveAvailable, type LiveSessionCallbacks, type ToolCall } from "../../services/ai/live";
import { Ringtone } from "../../services/ai/ringtone";
import { fmtDh, daysSince } from "../../lib/format";
import type { Store } from "../../state/store";
import { Button, cn } from "../../components/ui";

type ProductChip = { name: string; emoji: string; image?: string; qty: number; priceDh: number };
type Msg = { id: string; role: "user" | "ai" | "tool"; text: string; products?: ProductChip[] };
type Outcome = { data: Record<string, unknown>; message?: string; products?: ProductChip[] };

/** Conversation vocale continue, comme le mode vocal de ChatGPT :
 *  micro ouvert en permanence, réponses audio instantanées,
 *  l'IA ajoute / retire / encaisse sur le ticket pendant qu'elle parle. */
export function LiveVoiceModal({
  store,
  open,
  onClose,
}: {
  store: Store;
  open: boolean;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"connecting" | "listening" | "speaking" | "error">("connecting");
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [pickingCredit, setPickingCredit] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [paidLabel, setPaidLabel] = useState<string | null>(null);
  const typedAtRef = useRef(0);
  const sessionRef = useRef<LiveSession | null>(null);
  const ringRef = useRef<Ringtone | null>(null);
  const storeRef = useRef(store);
  const listRef = useRef<HTMLDivElement>(null);
  const partialRef = useRef<{ user?: string; ai?: string }>({});
  storeRef.current = store;

  useEffect(() => {
    if (!open) return;
    setMsgs([]);
    setError("");
    setStatus("connecting");
    partialRef.current = {};

    const addMsg = (role: Msg["role"], text: string, products?: ProductChip[]) =>
      setMsgs((prev) => [
        ...prev,
        { id: `m-${Date.now()}-${prev.length}`, role, text, products },
      ]);

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

    const chipOf = (productId: string, qty: number): ProductChip => {
      const p = storeRef.current.productById(productId);
      return {
        name: p?.name ?? productId,
        emoji: p?.emoji ?? "🧺",
        image: p?.image,
        qty,
        priceDh: p?.priceDh ?? 0,
      };
    };

    const findClient = (name: string) => {
      const q = name.toLowerCase().trim();
      const cs = storeRef.current.clients;
      return (
        cs.find((c) => c.name.toLowerCase() === q) ??
        cs.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
      );
    };

    const toolHandlers: Record<string, (args: Record<string, unknown>) => Outcome> = {
      addProduct: (args) => {
        const name = String(args.name ?? "");
        const qty = Math.max(1, Number(args.qty) || 1);
        const cur = storeRef.current;
        const matched = matchProducts([{ name, qty }], cur.products);
        if (!matched.length)
          return { data: { ok: false, error: `produit inconnu: ${name}` }, message: `Produit inconnu : ${name}` };
        for (const m of matched) cur.addToCart(m.product.id, m.qty);
        const chips = matched.map((m) => chipOf(m.product.id, m.qty));
        return {
          data: {
            ok: true,
            added: chips.map((c) => ({ name: c.name, qty: c.qty })),
            cartTotal: cur.cartTotal,
          },
          message: `${chips.map((c) => `${c.qty} × ${c.name}`).join(", ")} ajouté`,
          products: chips, // 📷 affiche l'image du produit dans la conversation
        };
      },
      removeProduct: (args) => {
        const cur = storeRef.current;
        const name = String(args.name ?? "");
        const matched = matchProducts([{ name, qty: 1 }], cur.products);
        if (!matched.length)
          return { data: { ok: false, error: `produit inconnu: ${name}` }, message: `Produit inconnu : ${name}` };
        const pid = matched[0].product.id;
        const line = cur.cart.find((l) => l.productId === pid);
        if (!line)
          return { data: { ok: false }, message: `${matched[0].product.name} n'est pas au panier` };
        const removeQty = args.qty != null ? Math.max(1, Number(args.qty) || 1) : line.qty;
        cur.setQty(pid, Math.max(0, line.qty - removeQty));
        return {
          data: { ok: true, cartTotal: cur.cartTotal },
          message: `${Math.min(removeQty, line.qty)} × ${matched[0].product.name} retiré`,
        };
      },
      getCart: () => {
        const cur = storeRef.current;
        const chips = cur.cart.map((l) => chipOf(l.productId, l.qty));
        return {
          data: {
            ok: true,
            items: chips.map((c) => ({ name: c.name, qty: c.qty })),
            totalDh: cur.cartTotal,
          },
          message: chips.length
            ? `Panier : ${chips.map((c) => `${c.qty} × ${c.name}`).join(", ")} = ${fmtDh(cur.cartTotal)}`
            : "Panier vide",
          products: chips.length ? chips : undefined,
        };
      },
      checkout: (args) => {
        const cur = storeRef.current;
        const raw = String(args.method ?? "cash");
        const method = raw === "card" ? "card" : raw === "kridi" ? "kridi" : "cash";
        let clientId: string | undefined;
        let clientName: string | undefined;
        if (method === "kridi") {
          const cl = findClient(String(args.client ?? ""));
          if (!cl)
            return {
              data: { ok: false, error: "client inconnu" },
              message: `Client inconnu : ${args.client ?? "?"} — précise un nom du carnet de crédit`,
            };
          clientId = cl.id;
          clientName = cl.name;
        }
        const sale = cur.checkout(method, clientId);
        if (!sale) return { data: { ok: false, error: "panier vide" }, message: "Panier vide, rien à encaisser" };
        const label =
          method === "card" ? "carte" : method === "kridi" ? `kridi ${clientName}` : "espèces";
        return {
          data: { ok: true, ticket: sale.ticketNo, totalDh: sale.totalDh, method },
          message: `Ticket #${sale.ticketNo} — ${fmtDh(sale.totalDh)} (${label})`,
        };
      },
      /* -------- carnet de crédit (kridi) -------- */
      getDebts: () => {
        const cs = storeRef.current.clients
          .filter((c) => c.debtDh > 0)
          .sort((a, b) => b.debtDh - a.debtDh);
        const list = cs.map((c) => ({
          name: c.name,
          debtDh: c.debtDh,
          days: daysSince(c.since),
        }));
        const total = list.reduce((sum, c) => sum + c.debtDh, 0);
        return {
          data: { ok: true, clients: list, totalDh: total },
          message: list.length
            ? `Kridi (${fmtDh(total)}) : ${list
                .map((c) => `${c.name} ${fmtDh(c.debtDh)} — ${c.days} j`)
                .join(", ")}`
            : "Aucun crédit en cours",
        };
      },
      getClientDebt: (args) => {
        const cl = findClient(String(args.name ?? ""));
        if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
        return {
          data: {
            ok: true,
            name: cl.name,
            debtDh: cl.debtDh,
            days: daysSince(cl.since),
            phone: cl.phone,
            note: cl.note,
            recent: cl.history.slice(0, 3).map((h) => ({
              label: h.label,
              amountDh: h.amountDh,
              items: h.items?.map((it) => ({ name: it.name, qty: it.qty })),
            })),
          },
          message: `${cl.name} : ${fmtDh(cl.debtDh)} de crédit (depuis ${daysSince(cl.since)} j)${
            cl.phone ? ` — ☎ ${cl.phone}` : ""
          }`,
        };
      },
      getClientHistory: (args) => {
        const cl = findClient(String(args.name ?? ""));
        if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
        const moves = cl.history.map((h) => ({
          label: h.label,
          amountDh: h.amountDh,
          date: h.date,
          items: h.items?.map((it) => ({ name: it.name, qty: it.qty, priceDh: it.priceDh })),
        }));
        const bought = cl.history.flatMap((h) => h.items ?? []);
        const detail = bought.length
          ? bought.map((it) => `${it.qty} × ${it.name}`).join(", ")
          : "aucun produit détaillé";
        return {
          data: { ok: true, name: cl.name, debtDh: cl.debtDh, moves },
          message: bought.length
            ? `Achats à crédit de ${cl.name} : ${detail}`
            : `${cl.name} — pas de détail des produits enregistré`,
        };
      },
      addDebt: (args) => {
        const cur = storeRef.current;
        const name = String(args.name ?? "").trim();
        if (!name) return { data: { ok: false }, message: "Nom du client manquant" };
        const rawItems = Array.isArray(args.items)
          ? (args.items as { name?: unknown; qty?: unknown }[])
          : [];
        const matched = rawItems.length
          ? matchProducts(
              rawItems.map((it) => ({ name: String(it.name ?? ""), qty: Math.max(1, Number(it.qty) || 1) })),
              cur.products,
            )
          : [];
        const items: { name: string; qty: number; priceDh: number }[] = matched.map((m) => ({
          name: m.product.name,
          qty: m.qty,
          priceDh: m.product.priceDh,
        }));
        const itemsTotal = items.reduce((sum, it) => sum + it.priceDh * it.qty, 0);
        const givenAmount = Math.max(0, Number(args.amountDh) || 0);
        const amountDh = givenAmount || itemsTotal;
        if (!amountDh)
          return {
            data: { ok: false, needItems: true },
            message: `Il manque le montant et le produit — demande ce que ${name} a pris`,
          };
        let cl = findClient(name);
        if (!cl) cl = cur.addClient(name);
        const label =
          String(args.note ?? "").trim() ||
          (items.length ? items.map((it) => `${it.qty}× ${it.name}`).join(", ") : "Achat à crédit");
        cur.addDebt(cl.id, amountDh, label, items.length ? items : undefined);
        const chips: ProductChip[] = items.map((it) => {
          const p = cur.products.find((x) => x.name === it.name);
          return { name: it.name, emoji: p?.emoji ?? "🧺", image: p?.image, qty: it.qty, priceDh: it.priceDh };
        });
        return {
          data: { ok: true, name: cl.name, addedDh: amountDh, newDebtDh: cl.debtDh + amountDh, items: chips.map((c) => ({ name: c.name, qty: c.qty })) },
          message: `${cl.name} : +${fmtDh(amountDh)} au kridi${
            chips.length ? ` (${chips.map((c) => `${c.qty} × ${c.name}`).join(", ")})` : ""
          } — total ${fmtDh(cl.debtDh + amountDh)}`,
          products: chips.length ? chips : undefined,
        };
      },
      payDebt: (args) => {
        const cur = storeRef.current;
        const cl = findClient(String(args.name ?? ""));
        if (!cl) return { data: { ok: false }, message: `Client inconnu : ${args.name ?? "?"}` };
        const amountDh = Math.max(0, Number(args.amountDh) || 0);
        if (!amountDh) return { data: { ok: false }, message: "Montant payé manquant" };
        cur.payDebt(cl.id, amountDh);
        const remaining = Math.max(0, cl.debtDh - amountDh);
        return {
          data: { ok: true, name: cl.name, paidDh: amountDh, remainingDh: remaining },
          message: `${cl.name} a payé ${fmtDh(amountDh)} — reste ${fmtDh(remaining)}`,
        };
      },
      updateClient: (args) => {
        const cur = storeRef.current;
        const name = String(args.name ?? "").trim();
        if (!name) return { data: { ok: false }, message: "Nom du client manquant" };
        let cl = findClient(name);
        if (!cl) cl = cur.addClient(name);
        const patch: { name?: string; phone?: string; note?: string } = {};
        if (args.newName) patch.name = String(args.newName).trim();
        if (args.phone) patch.phone = String(args.phone).trim();
        if (args.note) patch.note = String(args.note).trim();
        if (!Object.keys(patch).length)
          return { data: { ok: false }, message: "Rien à modifier (nom, téléphone ou note ?)" };
        cur.updateClient(cl.id, patch);
        const parts = [
          patch.name ? `ism -> ${patch.name}` : "",
          patch.phone ? `tilifun ${patch.phone}` : "",
          patch.note ? `note : ${patch.note}` : "",
        ].filter(Boolean);
        return {
          data: { ok: true, name: patch.name ?? cl.name, updated: patch },
          message: `${cl.name} : ${parts.join(" · ")}`,
        };
      },
    };

    const ring = new Ringtone();
    ringRef.current = ring;
    ring.start(); // 🔔 sonnerie pendant la connexion

    const callbacks: LiveSessionCallbacks = {
      onReady: () => {
        ring.stop();
        ring.blip("pickup"); // 📞 décroché
        setStatus("listening");
      },
      onActivity: (a) => setStatus(a),
      onUserTranscript: (t) => {
        // on ignore l'écho de transcription juste après un envoi écrit
        if (Date.now() - typedAtRef.current < 2500) return;
        upsertPartial("user", t, false);
      },
      onAssistantTranscript: (t) => upsertPartial("ai", t, false),
      onToolCall: async (call: ToolCall) => {
        const handler = toolHandlers[call.name];
        if (!handler) {
          addMsg("tool", `Outil inconnu : ${call.name}`);
          return { ok: false, error: `unknown tool ${call.name}` };
        }
        const outcome = handler(call.args);
        if (outcome.message) addMsg("tool", outcome.message, outcome.products);
        return outcome.data;
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

    const session = new LiveSession(storeRef.current.products, callbacks);
    sessionRef.current = session;
    void session.start();

    return () => {
      session.stop();
      sessionRef.current = null;
      ring.dispose();
      ringRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  if (!open) return null;

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    typedAtRef.current = Date.now();
    setMsgs((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, role: "user", text },
    ]);
    sessionRef.current?.sendText(text);
    setTyped("");
  };

  const statusLabel =
    status === "connecting"
      ? "Connexion au cerveau IA…"
      : status === "speaking"
        ? "PAYZIK parle…"
        : status === "error"
          ? "Interrompu"
          : "Je t'écoute — parle librement";

  const cartLines = store.cart.map((l) => {
    const p = store.productById(l.productId);
    return {
      id: l.productId,
      name: p?.name ?? l.productId,
      emoji: p?.emoji ?? "🧺",
      image: p?.image,
      qty: l.qty,
      priceDh: p?.priceDh ?? 0,
    };
  });

  const hangup = () => {
    ringRef.current?.stop();
    ringRef.current?.blip("hangup");
    sessionRef.current?.stop();
    onClose();
  };

  const payNow = (method: "cash" | "card" | "kridi", clientId?: string) => {
    const sale = storeRef.current.checkout(method, clientId);
    if (!sale) return;
    const label = method === "cash" ? "Espèces" : method === "card" ? "Carte" : "Crédit";
    setPaidLabel(`${fmtDh(sale.totalDh)} · ${label}`);
    setMsgs((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}`,
        role: "tool",
        text: `Ticket #${sale.ticketNo} encaissé — ${fmtDh(sale.totalDh)} (${label})`,
      },
    ]);
    setPickingCredit(false);
    setNewClient("");
    window.setTimeout(() => setPaidLabel(null), 2600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center">
      <div className="animate-fade-up flex h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-ink shadow-2xl sm:h-[84vh] sm:rounded-3xl">
        {/* en-tête */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-colors duration-300",
                status === "speaking"
                  ? "bg-emerald-500"
                  : status === "error"
                    ? "bg-rose-500"
                    : "bg-brand",
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
              <p className="text-sm font-bold leading-tight">Assistant PAYZIK</p>
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
            title="Raccrocher"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* fil de discussion — fond blanc, démarre vide */}
        <div ref={listRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Mic size={26} />
              </span>
              <p className="max-w-[16rem] text-sm text-slate-400">
                Parle : « zid zit », puis « zid sukkar »… chaque produit s'affiche avec sa photo,
                puis le total et les options de paiement.
              </p>
            </div>
          )}

          {msgs.map((m) =>
            m.role === "tool" ? (
              <div key={m.id} className="animate-fade-up space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check size={12} />
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{m.text}</span>
                </div>
                {m.products && m.products.length > 0 && (
                  <div className="space-y-2">
                    {m.products.map((p, i) => (
                      <div
                        key={`${m.id}-${i}`}
                        className="flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-card"
                      >
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-2xl ring-1 ring-inset ring-slate-200/70">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            p.emoji
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            {fmtDh(p.priceDh)} × {p.qty}
                          </p>
                        </div>
                        <span className="tnum text-sm font-black text-ink">
                          {fmtDh(p.priceDh * p.qty)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "animate-fade-up max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto rounded-br-md bg-brand text-white"
                    : "rounded-bl-md bg-slate-100 text-slate-700",
                  m.id.startsWith("p-") && "opacity-70",
                )}
              >
                {m.text}
              </div>
            ),
          )}
        </div>

        {/* total + 3 options de paiement */}
        {cartLines.length > 0 && (
          <div className="border-t bg-slate-50/80 px-5 py-3">
            <div className="mb-2 flex items-end justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total
              </span>
              <span className="tnum text-2xl font-black text-ink">{fmtDh(store.cartTotal)}</span>
            </div>

            {pickingCredit ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500">Sur quel carnet de crédit ?</p>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {store.clients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => payNow("kridi", c.id)}
                      className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-amber-400 hover:text-amber-700"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = newClient.trim();
                    if (!n) return;
                    const c = storeRef.current.addClient(n);
                    payNow("kridi", c.id);
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="Nouveau client…"
                    className="h-9 flex-1 rounded-lg border bg-white px-3 text-xs outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="flex h-9 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    <UserPlus size={13} /> Créer
                  </button>
                </form>
                <button
                  onClick={() => setPickingCredit(false)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => payNow("cash")}
                  className="flex flex-col items-center gap-1 rounded-xl border bg-white py-2.5 text-xs font-bold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                >
                  <Banknote size={18} /> Espèces
                </button>
                <button
                  onClick={() => setPickingCredit(true)}
                  className="flex flex-col items-center gap-1 rounded-xl border bg-white py-2.5 text-xs font-bold text-amber-700 transition hover:border-amber-400 hover:bg-amber-50"
                >
                  <BookOpen size={18} /> Crédit
                </button>
                <button
                  onClick={() => payNow("card")}
                  className="flex flex-col items-center gap-1 rounded-xl border border-teal/40 bg-white py-2.5 text-xs font-bold text-teal-deep transition hover:border-teal hover:bg-accent-soft"
                >
                  <CreditCard size={18} /> Carte
                </button>
              </div>
            )}

            {paidLabel && (
              <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 text-xs font-bold text-emerald-700">
                <Check size={13} /> Payé — {paidLabel}
              </p>
            )}
          </div>
        )}

        {/* raccourcis + écriture + raccrocher */}
        <div className="border-t px-5 py-3.5">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["ch7al lmajmou3 ?", "zid jouj sokkar", "chkoun 3lih lkridi ?"].map((q) => (
              <button
                key={q}
                onClick={() => sessionRef.current?.sendText(q)}
                className="rounded-full border bg-white px-3 py-1 text-xs text-slate-500 transition hover:border-brand hover:text-brand"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            className="mb-2.5 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendTyped();
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Écris ou parle… (ex. zid jouj Sidi Ali)"
              className="h-11 flex-1 rounded-xl border bg-slate-50 px-3.5 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
            />
            <button
              type="submit"
              disabled={!typed.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-hover disabled:opacity-40"
              title="Envoyer"
            >
              <SendHorizontal size={18} />
            </button>
          </form>

          {!liveAvailable() && (
            <p className="mb-2 text-center text-xs text-amber-600">
              Clé Gemini manquante — ajoute VITE_GEMINI_API_KEY dans .env puis relance le serveur.
            </p>
          )}

          <Button
            variant="danger"
            className="w-full !bg-rose-500 !py-2.5 !text-white hover:!bg-rose-600"
            onClick={hangup}
          >
            <PhoneOff size={16} /> Raccrocher
          </Button>
        </div>
      </div>
    </div>
  );
}

import { HandCoins, History, MessageCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { daysSince, fmtDh } from "../../lib/format";
import type { Store } from "../../state/store";
import type { Client } from "../../types";
import { Button, Card, cn, Modal, StatusDot } from "../../components/ui";

function risk(days: number) {
  if (days > 30) return { tone: "rose" as const, label: `${days}j — risqué`, pct: 100 };
  if (days > 15) return { tone: "amber" as const, label: `${days}j`, pct: 60 };
  return { tone: "emerald" as const, label: `${days}j — récent`, pct: 25 };
}

export function KridiView({ store }: { store: Store }) {
  const [payFor, setPayFor] = useState<Client | null>(null);
  const [histFor, setHistFor] = useState<Client | null>(null);
  const [editFor, setEditFor] = useState<Client | null>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNote, setEditNote] = useState("");

  const openEdit = (c: Client) => {
    setEditFor(c);
    setEditName(c.name);
    setEditPhone(c.phone ?? "");
    setEditNote(c.note ?? "");
  };

  const debtors = [...store.clients].sort((a, b) => b.debtDh - a.debtDh);
  const totalDebt = debtors.reduce((s, c) => s + c.debtDh, 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-black text-ink">Carnet Kridi</h2>
          <p className="text-sm text-slate-400">Dettes clients & rappels</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Total dû
          </p>
          <p className="tnum text-2xl font-black text-ink">{fmtDh(totalDebt)}</p>
        </div>
      </div>

      <Card className="divide-y overflow-hidden">
        {debtors.map((c) => {
          const days = daysSince(c.since);
          const r = risk(days);
          return (
            <div key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-sm font-black text-brand">
                {c.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-ink">{c.name}</p>
                  {c.debtDh > 0 && <StatusDot tone={r.tone}>{r.label}</StatusDot>}
                </div>
                {(c.phone || c.note) && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {c.phone ? `☎ ${c.phone}` : ""}
                    {c.phone && c.note ? " · " : ""}
                    {c.note ?? ""}
                  </p>
                )}
                {/* jauge de risque */}
                <div className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      r.tone === "rose" && "bg-rose-500",
                      r.tone === "amber" && "bg-amber-500",
                      r.tone === "emerald" && "bg-emerald-500",
                    )}
                    style={{ width: c.debtDh > 0 ? `${r.pct}%` : "0%" }}
                  />
                </div>
              </div>
              <p className="tnum text-base font-black text-ink">{fmtDh(c.debtDh)}</p>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  className="!px-2.5 !py-1.5 text-xs"
                  disabled={c.debtDh === 0}
                  onClick={() => {
                    setPayFor(c);
                    setAmount("");
                  }}
                >
                  <HandCoins size={13} /> Acompte
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-1.5"
                  title="Rappel WhatsApp"
                  onClick={() =>
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(
                        `Salam ${c.name}, rappel amical : il reste ${fmtDh(c.debtDh)} sur le carnet. Merci ! — Hanout Central`,
                      )}`,
                    )
                  }
                >
                  <MessageCircle size={14} className="text-emerald-600" />
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-1.5"
                  title="Modifier les infos"
                  onClick={() => openEdit(c)}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  className="!px-2 !py-1.5"
                  title="Historique"
                  onClick={() => setHistFor(c)}
                >
                  <History size={14} />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      {/* ---- acompte ---- */}
      <Modal
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title={`Encaisser un acompte — ${payFor?.name}`}
      >
        <p className="mb-3 text-sm text-slate-500">
          Dette actuelle :{" "}
          <span className="tnum font-bold text-ink">{fmtDh(payFor?.debtDh ?? 0)}</span>
        </p>
        <div className="mb-4 flex gap-2">
          <input
            type="number"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
            placeholder="Montant reçu (DH)"
            className="tnum h-11 flex-1 rounded-xl border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <Button
            variant="secondary"
            onClick={() => setAmount(payFor?.debtDh ?? 0)}
          >
            Tout
          </Button>
        </div>
        {typeof amount === "number" && amount > 0 && payFor && (
          <p className="mb-4 text-sm text-slate-500">
            Nouveau solde :{" "}
            <span className="tnum font-black text-emerald-600">
              {fmtDh(Math.max(0, payFor.debtDh - amount))}
            </span>
          </p>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={typeof amount !== "number" || amount <= 0}
          onClick={() => {
            if (payFor && typeof amount === "number") {
              store.payDebt(payFor.id, amount);
              setPayFor(null);
            }
          }}
        >
          Encaisser l'acompte
        </Button>
      </Modal>

      {/* ---- historique ---- */}
      <Modal
        open={!!histFor}
        onClose={() => setHistFor(null)}
        title={`Historique — ${histFor?.name}`}
        wide
      >
        <div className="scrollbar-thin max-h-80 space-y-1.5 overflow-y-auto">
          {histFor?.history.map((h) => (
            <div
              key={h.id}
              className="rounded-xl border px-3.5 py-2.5 text-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink">{h.label}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(h.date).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <span
                  className={cn(
                    "tnum font-black",
                    h.amountDh < 0 ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {h.amountDh < 0 ? "−" : "+"}
                  {fmtDh(Math.abs(h.amountDh))}
                </span>
              </div>
              {h.items && h.items.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t pt-1.5">
                  {h.items.map((it, i) => (
                    <li key={i} className="flex justify-between text-xs text-slate-500">
                      <span>
                        {it.qty} × {it.name}
                      </span>
                      <span className="tnum">{fmtDh(it.priceDh * it.qty)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {histFor?.history.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">Aucune opération.</p>
          )}
        </div>
      </Modal>

      {/* ---- infos personnelles ---- */}
      <Modal
        open={!!editFor}
        onClose={() => setEditFor(null)}
        title="Infos personnelles du client"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Nom</span>
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Téléphone</span>
            <input
              inputMode="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="06 xx xx xx xx"
              className="tnum h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Note</span>
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Adresse, famille…"
              className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <Button
            variant="primary"
            className="w-full"
            disabled={!editName.trim()}
            onClick={() => {
              if (editFor) {
                store.updateClient(editFor.id, {
                  name: editName.trim(),
                  phone: editPhone.trim() || undefined,
                  note: editNote.trim() || undefined,
                });
                setEditFor(null);
              }
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Modal>
    </div>
  );
}

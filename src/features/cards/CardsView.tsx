import QRCode from "qrcode";
import {
  CreditCard,
  Plus,
  Printer,
  ScanLine,
  Search,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDh } from "../../lib/format";
import { parseCardCode, PIN_THRESHOLD } from "../../lib/wallet";
import type { Store } from "../../state/store";
import type { WalletCard } from "../../types";
import { Button, Card, cn, Modal, QrCode } from "../../components/ui";
import { QrScanModal } from "./QrScanModal";

const QUICK_TOPUP = [20, 50, 100, 200];

export function CardsView({ store }: { store: Store }) {
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const cards = useMemo(() => {
    const t = q.trim().toLowerCase();
    return store.cards.filter(
      (c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t),
    );
  }, [store.cards, q]);

  const detail = store.cards.find((c) => c.id === detailId) ?? null;
  const totalFloat = store.cards.reduce((s, c) => s + c.balanceDh, 0);

  const handleScan = (raw: string) => {
    setScanOpen(false);
    const card = store.findCardByCode(parseCardCode(raw));
    if (card) {
      setDetailId(card.id);
      setNotice("");
    } else {
      setNotice("Aucune carte ne correspond à ce code.");
      setTimeout(() => setNotice(""), 3000);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-ink">
            <Wallet size={20} className="text-brand" /> Cartes PAYZIK
          </h1>
          <p className="text-sm text-slate-500">
            Cartes rechargeables — QR unique, solde mis à jour à chaque opération.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setScanOpen(true)}>
            <ScanLine size={15} /> Scanner
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Nouvelle carte
          </Button>
        </div>
      </header>

      {notice && (
        <div className="animate-fade-up rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card className="!rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Cartes actives
          </p>
          <p className="tnum mt-1 text-2xl font-black text-ink">{store.cards.length}</p>
        </Card>
        <Card className="!rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Encours total
          </p>
          <p className="tnum mt-1 text-2xl font-black text-brand">{fmtDh(totalFloat)}</p>
        </Card>
        <Card className="!rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            PIN dès
          </p>
          <p className="tnum mt-1 text-2xl font-black text-ink">{PIN_THRESHOLD} DH</p>
        </Card>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom ou code…"
          className="h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <button key={c.id} onClick={() => setDetailId(c.id)} className="text-left">
            <CardPill card={c} />
          </button>
        ))}
        {cards.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            Aucune carte. Crée la première avec « Nouvelle carte ».
          </p>
        )}
      </div>

      <CreateCardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(card) => {
          setCreateOpen(false);
          setDetailId(card.id);
        }}
        store={store}
      />

      <CardDetailModal
        card={detail}
        store={store}
        onClose={() => setDetailId(null)}
      />

      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScan} />
    </div>
  );
}

/* ---------- carte (pastille) ---------- */
function CardPill({ card }: { card: WalletCard }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-indigo-800 p-5 text-white shadow-pop">
      <div className="flex items-start justify-between">
        <CreditCard size={22} className="opacity-80" />
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          PAYZIK
        </span>
      </div>
      <p className="mt-4 text-lg font-black">{card.name}</p>
      <p className="tnum text-xs text-white/70">{card.code}</p>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Solde
          </p>
          <p className="tnum text-2xl font-black">{fmtDh(card.balanceDh)}</p>
        </div>
        <p className="text-[10px] text-white/60">{card.phone ?? "—"}</p>
      </div>
    </div>
  );
}

/* ---------- création ---------- */
function CreateCardModal({
  open,
  onClose,
  onCreate,
  store,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (card: WalletCard) => void;
  store: Store;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [initial, setInitial] = useState<number | "">("");

  const reset = () => {
    setName("");
    setPhone("");
    setPin("");
    setInitial("");
  };

  const valid = name.trim().length > 0 && (pin === "" || /^\d{4}$/.test(pin));

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle carte PAYZIK">
      <div className="space-y-3">
        <Field label="Nom du client">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Khadija"
            className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </Field>
        <Field label="Téléphone (optionnel)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PIN (4 chiffres, optionnel)">
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="tnum h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm tracking-widest outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </Field>
          <Field label="Recharge initiale (DH)">
            <input
              inputMode="numeric"
              value={initial}
              onChange={(e) => setInitial(e.target.value ? Number(e.target.value) : "")}
              placeholder="0"
              className="tnum h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </Field>
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Le PIN (si défini) sera demandé pour les paiements ≥ {PIN_THRESHOLD} DH.
        </p>
        <Button
          variant="primary"
          className="w-full !py-3"
          disabled={!valid}
          onClick={() => {
            const card = store.addCard({
              name: name.trim(),
              phone: phone.trim() || undefined,
              pin: pin || undefined,
              initialDh: typeof initial === "number" ? initial : 0,
            });
            reset();
            onCreate(card);
          }}
        >
          <Plus size={16} /> Créer la carte & générer le QR
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- détail + recharge + historique ---------- */
function CardDetailModal({
  card,
  store,
  onClose,
}: {
  card: WalletCard | null;
  store: Store;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [flash, setFlash] = useState("");
  const txs = card ? store.cardTxFor(card.id) : [];

  const recharge = () => {
    if (!card || typeof amount !== "number" || amount <= 0) return;
    store.topUpCard(card.id, amount);
    setFlash(`+${fmtDh(amount)} — nouveau solde ${fmtDh(card.balanceDh + amount)}`);
    setAmount("");
    setTimeout(() => setFlash(""), 3000);
  };

  const print = async () => {
    if (!card) return;
    const qr = await QRCode.toDataURL(card.code, { margin: 2, width: 400 });
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carte ${card.code}</title>
      <style>body{font-family:ui-sans-serif,Arial;text-align:center;padding:24px;color:#3A2A1F}
      .code{font-size:22px;font-weight:800;letter-spacing:2px;margin:8px 0}
      .name{font-size:20px;font-weight:800}.sub{color:#8B7458;font-size:12px}
      img{width:260px;height:260px}@media print{.noprint{display:none}}</style></head>
      <body><div class="name">${card.name}</div><div class="sub">Carte PAYZIK recyclable</div>
      <img src="${qr}"/><div class="code">${card.code}</div>
      <div class="sub">Présente ce QR en caisse à chaque achat</div>
      <button class="noprint" onclick="window.print()">Imprimer</button></body></html>`);
    w.document.close();
  };

  return (
    <Modal open={!!card} onClose={onClose} title={card ? `Carte — ${card.name}` : ""}>
      {card && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border bg-white p-3 shadow-sm">
              <QrCode value={card.code} size={120} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Solde disponible
              </p>
              <p className="tnum text-3xl font-black text-ink">{fmtDh(card.balanceDh)}</p>
              <p className="tnum mt-1 text-xs text-slate-400">{card.code}</p>
              {card.phone && <p className="text-xs text-slate-500">{card.phone}</p>}
            </div>
          </div>

          {flash && (
            <div className="animate-fade-up rounded-xl bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              {flash}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recharger la carte
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_TOPUP.map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className={cn(
                    "tnum rounded-xl border px-3.5 py-2 text-sm font-bold transition-all",
                    amount === v
                      ? "border-brand bg-brand-soft text-brand"
                      : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {v} DH
                </button>
              ))}
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
                placeholder="Autre…"
                className="tnum h-10 w-24 rounded-xl border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </div>
            <Button
              variant="primary"
              className="w-full !py-3"
              disabled={typeof amount !== "number" || amount <= 0}
              onClick={recharge}
            >
              Encaisser la recharge
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Historique
            </p>
            <div className="scrollbar-thin max-h-48 space-y-1.5 overflow-y-auto">
              {txs.length === 0 && <p className="text-sm text-slate-400">Aucune opération.</p>}
              {txs.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border bg-white px-3 py-2"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{t.label}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(t.at).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "tnum text-sm font-black",
                      t.type === "topup" ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {t.type === "topup" ? "+" : "−"}
                    {fmtDh(t.amountDh)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Button variant="secondary" className="w-full" onClick={print}>
            <Printer size={15} /> Imprimer la carte
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

import {
  Banknote,
  BookOpen,
  CreditCard,
  Minus,
  Plus,
  Receipt,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDh } from "../../lib/format";
import { parseCardCode, PIN_THRESHOLD } from "../../lib/wallet";
import type { Store } from "../../state/store";
import type { WalletCard } from "../../types";
import { ProductThumb } from "../stock/StockView";
import { QrScanModal } from "../cards/QrScanModal";
import { Button, Card, cn, Modal } from "../../components/ui";

const QUICK_CASH = [10, 20, 50, 100, 200];

export function CartPanel({ store }: { store: Store }) {
  const [clientId, setClientId] = useState<string>("");
  const [cashOpen, setCashOpen] = useState(false);
  const [kridiOpen, setKridiOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [card, setCard] = useState<WalletCard | null>(null);
  const [pin, setPin] = useState("");
  const [cardError, setCardError] = useState("");
  const [given, setGiven] = useState<number | "">("");
  const [flash, setFlash] = useState<string | null>(null);

  const total = store.cartTotal;
  const client = store.clients.find((c) => c.id === clientId);
  const change = typeof given === "number" ? given - total : 0;
  const needPin = total >= PIN_THRESHOLD && !!card?.pin;
  const pinOk = !needPin || pin === card?.pin;
  const afterPay = card ? card.balanceDh - total : 0;

  const openWallet = () => {
    setCard(null);
    setPin("");
    setCardError("");
    setWalletOpen(true);
    setScanOpen(true);
  };

  const onCardScanned = (raw: string) => {
    setScanOpen(false);
    const found = store.findCardByCode(parseCardCode(raw));
    if (found) {
      setCard(found);
      setCardError("");
    } else {
      setCard(null);
      setCardError("Carte inconnue — vérifie le QR ou crée la carte.");
    }
  };

  const confirmWallet = () => {
    if (!card) return;
    if (!pinOk) {
      setCardError("PIN incorrect.");
      return;
    }
    if (card.balanceDh < total) {
      setCardError("Solde insuffisant sur la carte.");
      return;
    }
    store.payWithCard(card.id, total, `Ticket #${store.ticketNo}`);
    store.checkout("wallet", clientId || undefined);
    setWalletOpen(false);
    finish(`✓ Carte ${card.name} — reste ${fmtDh(card.balanceDh - total)}`);
  };

  const lines = useMemo(
    () =>
      store.cart
        .map((l) => ({ line: l, product: store.productById(l.productId)! }))
        .filter((x) => x.product),
    [store],
  );

  const finish = (msg: string) => {
    setFlash(msg);
    setGiven("");
    setCashOpen(false);
    setKridiOpen(false);
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-3 border-l bg-white p-4">
      {/* en-tête ticket */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-slate-400" />
          <span className="text-sm font-bold text-ink">
            Ticket <span className="tnum text-slate-400">#{store.ticketNo}</span>
          </span>
        </div>
        {lines.length > 0 && (
          <button
            onClick={store.clearCart}
            className="text-xs font-semibold text-slate-400 hover:text-rose-600"
          >
            Vider
          </button>
        )}
      </div>

      {/* sélection client */}
      <div className="relative">
        <User size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-9 w-full appearance-none rounded-xl border bg-slate-50 pl-8 pr-3 text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        >
          <option value="">Client comptant</option>
          {store.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.debtDh > 0 ? `(doit ${fmtDh(c.debtDh)})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* lignes du panier */}
      <div className="scrollbar-thin -mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
        {flash && (
          <div className="animate-fade-up rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            {flash}
          </div>
        )}
        {lines.length === 0 && !flash && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-2xl">
              🛒
            </div>
            <p className="text-sm font-medium text-slate-400">
              Ticket vide — dicte, scanne
              <br />
              ou touche un produit
            </p>
          </div>
        )}
        {lines.map(({ line, product }) => (
          <div
            key={product.id}
            className="animate-fade-up flex items-center gap-2.5 rounded-xl border p-2.5"
          >
            <ProductThumb product={product} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink">{product.name}</p>
              <p className="tnum text-[11px] text-slate-400">
                {fmtDh(product.priceDh)} / unité
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => store.setQty(product.id, line.qty - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50"
              >
                <Minus size={13} />
              </button>
              <span className="tnum w-7 text-center text-sm font-bold">{line.qty}</span>
              <button
                onClick={() => store.setQty(product.id, line.qty + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50"
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              onClick={() => store.setQty(product.id, 0)}
              className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* récapitulatif */}
      <Card className="space-y-1.5 !rounded-xl bg-slate-50 p-3.5">
        <div className="flex justify-between text-xs font-medium text-slate-500">
          <span>Sous-total</span>
          <span className="tnum">{fmtDh(total)}</span>
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-500">
          <span>Remise</span>
          <span className="tnum">—</span>
        </div>
        <div className="flex items-end justify-between border-t pt-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Total
          </span>
          <span className="tnum text-3xl font-black tracking-tight text-ink">
            {fmtDh(total)}
          </span>
        </div>
      </Card>

      {/* encaissement */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          disabled={lines.length === 0}
          className="col-span-2 !py-3.5 text-base"
          onClick={() => setCashOpen(true)}
        >
          <Banknote size={18} /> Espèces
        </Button>
        <Button
          disabled={lines.length === 0}
          className="col-span-2 !bg-emerald-600 !py-3 !text-white hover:!bg-emerald-700"
          onClick={openWallet}
        >
          <Wallet size={16} /> Carte PAYZIK rechargeable
        </Button>
        <Button
          variant="amber"
          disabled={lines.length === 0}
          onClick={() => setKridiOpen(true)}
        >
          <BookOpen size={15} /> Carnet Kridi
        </Button>
        <Button
          variant="secondary"
          disabled={lines.length === 0}
          onClick={() => {
            store.checkout("card", clientId || undefined);
            finish("✓ Paiement carte accepté");
          }}
        >
          <CreditCard size={15} /> Carte / TPE
        </Button>
      </div>

      {/* ---- modale cash : monnaie rendue ---- */}
      <Modal open={cashOpen} onClose={() => setCashOpen(false)} title="Encaissement espèces">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Total à payer
        </p>
        <p className="tnum mb-4 text-3xl font-black text-ink">{fmtDh(total)}</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_CASH.filter((v) => v >= total).map((v) => (
            <button
              key={v}
              onClick={() => setGiven(v)}
              className={cn(
                "tnum rounded-xl border px-3.5 py-2 text-sm font-bold transition-all",
                given === v
                  ? "border-brand bg-brand-soft text-brand"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {v} DH
            </button>
          ))}
          <input
            type="number"
            placeholder="Autre…"
            value={given}
            onChange={(e) => setGiven(e.target.value ? Number(e.target.value) : "")}
            className="tnum h-10 w-24 rounded-xl border bg-slate-50 px-3 text-sm font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
        {typeof given === "number" && given >= total && (
          <div className="animate-fade-up mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-600/20">
            <span className="text-sm font-bold text-emerald-700">Monnaie à rendre</span>
            <span className="tnum text-2xl font-black text-emerald-700">
              {fmtDh(change)}
            </span>
          </div>
        )}
        <Button
          variant="dark"
          className="w-full !py-3"
          onClick={() => {
            store.checkout("cash", clientId || undefined);
            finish("✓ Vente encaissée en espèces");
          }}
        >
          Confirmer l'encaissement
        </Button>
      </Modal>

      {/* ---- modale kridi : confirmation + nouveau solde ---- */}
      <Modal open={kridiOpen} onClose={() => setKridiOpen(false)} title="Mettre sur Carnet Kridi">
        <KridiConfirm
          store={store}
          clientId={clientId}
          onPick={setClientId}
          total={total}
          onConfirm={() => {
            if (!clientId) return;
            store.checkout("kridi", clientId);
            finish(`✓ Noté sur le carnet de ${client?.name}`);
          }}
        />
      </Modal>

      {/* ---- modale Carte PAYZIK : scan QR + solde + PIN ---- */}
      <Modal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        title="Paiement Carte PAYZIK"
      >
        <div className="space-y-3">
          {!card ? (
            <>
              <p className="text-sm text-slate-500">
                Scanne le QR de la carte du client pour débiter le ticket.
              </p>
              <Button variant="primary" className="w-full !py-3" onClick={() => setScanOpen(true)}>
                <Wallet size={16} /> Scanner la carte
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-600/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-emerald-900">{card.name}</p>
                    <p className="tnum text-xs text-emerald-700">{card.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                      Solde
                    </p>
                    <p className="tnum text-xl font-black text-emerald-900">
                      {fmtDh(card.balanceDh)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3">
                <span className="text-sm font-semibold text-slate-500">Ticket à payer</span>
                <span className="tnum text-xl font-black text-ink">{fmtDh(total)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-500">Nouveau solde</span>
                <span
                  className={cn(
                    "tnum text-xl font-black",
                    afterPay < 0 ? "text-rose-600" : "text-emerald-700",
                  )}
                >
                  {fmtDh(Math.max(0, afterPay))}
                </span>
              </div>
              {needPin && (
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder={`PIN (${card.name})`}
                  className="tnum h-11 w-full rounded-xl border bg-slate-50 px-3 text-center text-lg tracking-[0.5em] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              )}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setScanOpen(true)}>
                  Changer
                </Button>
                <Button
                  className="flex-1 !bg-emerald-600 !text-white hover:!bg-emerald-700"
                  onClick={confirmWallet}
                >
                  Débiter {fmtDh(total)}
                </Button>
              </div>
            </>
          )}
          {cardError && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
              {cardError}
            </p>
          )}
        </div>
      </Modal>

      <QrScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={onCardScanned}
        title="Scanner la carte PAYZIK"
      />
    </aside>
  );
}

function KridiConfirm({
  store,
  clientId,
  onPick,
  total,
  onConfirm,
}: {
  store: Store;
  clientId: string;
  onPick: (id: string) => void;
  total: number;
  onConfirm: () => void;
}) {
  const [newName, setNewName] = useState("");
  const client = store.clients.find((c) => c.id === clientId);
  return (
    <div className="space-y-3">
      <select
        value={clientId}
        onChange={(e) => onPick(e.target.value)}
        className="h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        <option value="">— Choisir le client —</option>
        {store.clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="…ou nouveau client"
          className="h-10 flex-1 rounded-xl border bg-slate-50 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (newName.trim()) {
              const c = store.addClient(newName.trim());
              onPick(c.id);
              setNewName("");
            }
          }}
        >
          Créer
        </Button>
      </div>
      {client && (
        <div className="animate-fade-up space-y-1.5 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
          <div className="flex justify-between text-sm text-amber-800">
            <span>Dette actuelle</span>
            <span className="tnum font-bold">{fmtDh(client.debtDh)}</span>
          </div>
          <div className="flex justify-between text-sm text-amber-800">
            <span>+ Ce ticket</span>
            <span className="tnum font-bold">{fmtDh(total)}</span>
          </div>
          <div className="flex justify-between border-t border-amber-600/20 pt-1.5 text-sm font-black text-amber-900">
            <span>Nouveau solde dû</span>
            <span className="tnum text-lg">{fmtDh(client.debtDh + total)}</span>
          </div>
        </div>
      )}
      <Button variant="amber" disabled={!client} className="w-full !py-3" onClick={onConfirm}>
        <BookOpen size={16} /> Confirmer sur le carnet
      </Button>
    </div>
  );
}

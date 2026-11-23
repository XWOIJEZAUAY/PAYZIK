import { AlertTriangle, BookOpen, PackageX } from "lucide-react";
import type { Store } from "../../state/store";
import { cn, Drawer } from "../../components/ui";

export function StockAlertsDrawer({
  store,
  open,
  onClose,
}: {
  store: Store;
  open: boolean;
  onClose: () => void;
}) {
  const icon = {
    rupture: <PackageX size={16} className="text-rose-500" />,
    low: <AlertTriangle size={16} className="text-amber-500" />,
    debt: <BookOpen size={16} className="text-amber-600" />,
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Alertes (${store.alerts.length})`}>
      <div className="space-y-2">
        {store.alerts.map((a) => (
          <div
            key={a.id + a.kind}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-sm font-medium",
              a.kind === "rupture" && "border-rose-200 bg-rose-50/60 text-rose-800",
              a.kind === "low" && "border-amber-200 bg-amber-50/60 text-amber-800",
              a.kind === "debt" && "border-amber-200 bg-amber-50/60 text-amber-900",
            )}
          >
            {icon[a.kind]}
            <span>{a.text}</span>
          </div>
        ))}
        {store.alerts.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            ✓ Tout est en ordre — aucun stock bas ni impayé en retard.
          </p>
        )}
      </div>
    </Drawer>
  );
}

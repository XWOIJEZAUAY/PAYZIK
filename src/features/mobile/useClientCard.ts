/** Une seule carte cloud par compte client, partagée par tous les écrans. */
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "../../services/auth";
import {
  createGeneralCard,
  listMyCards,
  type PayzikCard,
} from "../../services/backend/payzikCards";

export function useClientCard(userId: string, name: string) {
  const [card, setCard] = useState<PayzikCard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await listMyCards();
    let found = res.ok
      ? (res.data.find((c) => c.card_type === "general" && c.status === "active") ??
         res.data[0] ??
         null)
      : null;

    if (!found) {
      const created = await createGeneralCard(name || "Client PAYZIK");
      if (created.ok) {
        const again = await listMyCards();
        found = again.ok ? (again.data[0] ?? null) : null;
      }
    }

    setCard(found);
    setLoading(false);
    return found;
  }, [name]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`client-card-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards", filter: `owner_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId, refresh]);

  return { card, loading, refresh };
}

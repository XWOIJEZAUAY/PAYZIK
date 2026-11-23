/** État partagé du réseau PAYZIK (localStorage) :
 *  commandes restaurant + profil client. Les commerces, pubs et menu sont statiques. */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CUSTOMER,
  DEMO_ADS,
  DEMO_ESTABLISHMENTS,
  DEMO_MENU,
  DEMO_ORDERS,
} from "../data/network";
import type { CustomerProfile, RestaurantOrder } from "../types";

const LS = {
  orders: "payzik.network.orders",
  customer: "payzik.network.customer",
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial));
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

export function useNetwork() {
  const [orders, setOrders] = usePersisted<RestaurantOrder[]>(LS.orders, DEMO_ORDERS);
  const [customer, setCustomer] = usePersisted<CustomerProfile>(
    LS.customer,
    DEFAULT_CUSTOMER,
  );

  const createOrder = useCallback(
    (input: Omit<RestaurantOrder, "id" | "createdAt">): RestaurantOrder => {
      const order: RestaurantOrder = {
        ...input,
        id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      };
      setOrders((os) => [order, ...os]);
      return order;
    },
    [setOrders],
  );

  const updateOrder = useCallback(
    (orderId: string, patch: Partial<Omit<RestaurantOrder, "id">>) => {
      setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    },
    [setOrders],
  );

  const updateCustomer = useCallback(
    (patch: Partial<Omit<CustomerProfile, "id">>) => {
      setCustomer((c) => ({ ...c, ...patch }));
    },
    [setCustomer],
  );

  const resetNetwork = useCallback(() => {
    setOrders(DEMO_ORDERS);
    setCustomer(DEFAULT_CUSTOMER);
  }, [setCustomer, setOrders]);

  return {
    orders,
    customer,
    establishments: DEMO_ESTABLISHMENTS,
    ads: DEMO_ADS,
    menu: DEMO_MENU,
    createOrder,
    updateOrder,
    updateCustomer,
    resetNetwork,
  };
}

export type Network = ReturnType<typeof useNetwork>;

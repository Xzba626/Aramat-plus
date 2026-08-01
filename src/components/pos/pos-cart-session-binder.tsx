"use client";

import { useEffect } from "react";
import { usePosCart } from "@/lib/stores/pos-cart";

/** Binds IndexedDB cart namespace to this seller + store (independent carts). */
export function PosCartSessionBinder({
  sellerId,
  storeId,
}: {
  sellerId: string;
  storeId: string | null | undefined;
}) {
  const bindSession = usePosCart((s) => s.bindSession);

  useEffect(() => {
    if (!sellerId || !storeId) return;
    void bindSession(sellerId, storeId);
  }, [sellerId, storeId, bindSession]);

  return null;
}

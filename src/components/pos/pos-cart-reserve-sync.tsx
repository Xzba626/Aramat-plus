"use client";

import { useEffect, useRef } from "react";
import { usePosCart } from "@/lib/stores/pos-cart";

/**
 * Keeps server-side stock hold in sync with local POS cart (no TTL).
 * Mount once under seller layout.
 */
export function PosCartReserveSync() {
  const lines = usePosCart((s) => s.lines);
  const hydrated = usePosCart((s) => s._hasHydrated);
  const setServerReservationId = usePosCart((s) => s.setServerReservationId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayload = useRef("");

  useEffect(() => {
    if (!hydrated) return;

    const payload = JSON.stringify(
      lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
    );
    if (payload === lastPayload.current) return;
    lastPayload.current = payload;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/reservations/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setServerReservationId(data?.id ?? null);
      } catch {
        // offline / flaky — local cart still persists
      }
    }, 600);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lines, hydrated, setServerReservationId]);

  return null;
}

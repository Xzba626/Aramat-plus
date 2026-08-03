"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Quiet prefetch of POS neighbour screens (X3 / Y3). */
export function PosNeighbourPrefetch() {
  const qc = useQueryClient();
  useEffect(() => {
    void qc.prefetchQuery({
      queryKey: ["cache:pos-catalog"],
      queryFn: async () => {
        const res = await fetch("/api/pos/catalog");
        return res.json();
      },
      staleTime: 60_000,
    });
    void qc.prefetchQuery({
      queryKey: ["cache:pos-bottles"],
      queryFn: async () => {
        const res = await fetch("/api/pos/packaging-bottles");
        return res.json();
      },
      staleTime: 5 * 60_000,
    });
    void qc.prefetchQuery({
      queryKey: ["cache:notifications-count"],
      queryFn: async () => {
        const res = await fetch("/api/notifications/count");
        if (!res.ok) return { unread: 0 };
        return res.json();
      },
      staleTime: 20_000,
    });
  }, [qc]);
  return null;
}

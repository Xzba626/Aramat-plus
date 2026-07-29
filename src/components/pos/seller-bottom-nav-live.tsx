"use client";

import { SellerBottomNav } from "@/components/layout/bottom-nav";
import { usePosCart } from "@/lib/stores/pos-cart";

export function SellerBottomNavLive() {
  const count = usePosCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  return <SellerBottomNav cartCount={count} />;
}

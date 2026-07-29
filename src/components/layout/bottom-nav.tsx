"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Owner Mobile — IA №15: три центра + уведомления + ещё */
const ownerMobileTabs = [
  { href: "/dashboard", label: "Главная", icon: "🏠" },
  { href: "/warehouse", label: "Склад", icon: "🏭" },
  { href: "/stores", label: "Магазины", icon: "🏢" },
  { href: "/notifications", label: "Уведомл.", icon: "🔔" },
  { href: "/settings", label: "Ещё", icon: "⋯" },
];

export function OwnerBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 lg:hidden">
      <div className="mx-auto flex max-w-[640px]">
        {ownerMobileTabs.map((l) => {
          const active =
            pathname === l.href ||
            (l.href !== "/dashboard" && pathname.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex flex-1 flex-col items-center px-0.5 py-1.5 text-[11px]",
                active ? "font-semibold text-brand" : "text-muted"
              )}
            >
              <span className="mb-0.5 text-[19px] leading-none">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SellerBottomNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname();
  const links = [
    { href: "/pos", label: "Продажа", icon: "⌕", match: (p: string) => p === "/pos" },
    {
      href: "/pos/history",
      label: "История",
      icon: "☰",
      match: (p: string) => p.startsWith("/pos/history"),
    },
    {
      href: "/pos/cart",
      label: "Корзина",
      icon: "🛒",
      match: (p: string) => p.startsWith("/pos/cart"),
      badge: cartCount,
    },
    {
      href: "/pos/notifications",
      label: "Уведомл.",
      icon: "🔔",
      match: (p: string) => p.startsWith("/pos/notifications"),
    },
    {
      href: "/pos/profile",
      label: "Профиль",
      icon: "👤",
      match: (p: string) => p.startsWith("/pos/profile"),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto flex max-w-[480px]">
        {links.map((l) => {
          const active = l.match(pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "relative flex flex-1 flex-col items-center px-0.5 py-1.5 text-[11px]",
                active ? "font-semibold text-brand" : "text-muted"
              )}
            >
              <span className="mb-0.5 text-[19px] leading-none">{l.icon}</span>
              {l.label}
              {l.badge ? (
                <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {l.badge > 9 ? "9+" : l.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { sectionTitleForPath } from "@/lib/navigation/owner-nav";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function OwnerTopBar({
  userName,
  role,
  onMenu,
}: {
  userName: string;
  role: string;
  onMenu?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sectionTitle = sectionTitleForPath(pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    // Global search entry — warehouse catalog is the primary lookup
    router.push(`/warehouse/products?q=${encodeURIComponent(q)}`);
  }

  const dateLabel = now
    ? now.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
  const timeLabel = now
    ? now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {onMenu ? (
          <button
            type="button"
            onClick={onMenu}
            className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink lg:hidden"
            aria-label="Меню"
          >
            ☰
          </button>
        ) : null}

        <Link
          href="/dashboard"
          className="hidden items-center gap-2 lg:flex"
          title="AROMAT PLUS"
        >
          <Image
            src="/logo-aramat-plus.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-contain"
          />
          <span className="text-sm font-bold text-ink">
            AROMAT <span className="text-brand">PLUS</span>
          </span>
        </Link>

        <div className="mx-1 hidden h-6 w-px bg-border lg:block" />

        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink sm:text-lg">
          {sectionTitle}
        </h1>

        <form
          onSubmit={onSearchSubmit}
          className="hidden max-w-[240px] flex-1 items-center gap-2 rounded-xl border border-border bg-page px-3 py-2 md:flex lg:max-w-xs"
        >
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            id="owner-global-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…  ( / )"
            className="border-0 bg-transparent p-0 text-sm shadow-none focus:ring-0"
            aria-label="Глобальный поиск"
          />
        </form>

        <div
          className="hidden text-right tabular-nums xl:block"
          suppressHydrationWarning
        >
          <div className="text-[11px] font-medium text-muted">{dateLabel}</div>
          <div className="text-sm font-semibold text-ink">{timeLabel}</div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/notifications"
            className="relative rounded-xl p-2.5 text-muted hover:bg-page hover:text-ink"
            title="Уведомления"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Link>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-page"
            >
              <span className="hidden max-w-[120px] truncate text-sm text-ink sm:inline">
                {userName}
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {initials(userName)}
              </span>
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border bg-card py-1 shadow-lg">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{userName}</p>
                  <p className="text-xs text-muted">{role}</p>
                </div>
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-sm text-ink hover:bg-page"
                  onClick={() => setProfileOpen(false)}
                >
                  Настройки
                </Link>
                <Link
                  href="/settings/password"
                  className="block px-3 py-2 text-sm text-ink hover:bg-page"
                  onClick={() => setProfileOpen(false)}
                >
                  Смена пароля
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
                >
                  Выход
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function DeltaBadge({
  pct,
  label,
}: {
  pct: number;
  label: string;
}) {
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={cn(
        "mt-1 inline-flex text-xs font-semibold",
        flat && "text-muted",
        up && "text-success",
        !up && !flat && "text-danger"
      )}
    >
      {flat ? "→" : up ? "↑" : "↓"} {label}
    </span>
  );
}

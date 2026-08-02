"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sectionTitleKeyForPath } from "@/lib/navigation/owner-nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelRole } from "@/lib/i18n/labels";

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
  menuOpen = false,
}: {
  userName: string;
  role: string;
  onMenu?: () => void;
  menuOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, formatDate, formatTime } = useI18n();
  const sectionTitle = t(sectionTitleKeyForPath(pathname));
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
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
    router.push(`/warehouse/products?q=${encodeURIComponent(q)}`);
  }

  const dateLabel = now ? formatDate(now) : "—";
  const timeLabel = now ? formatTime(now) : "--:--";

  return (
    <header className="sticky top-0 z-[60] border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2.5 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => onMenu?.()}
          className="rounded-xl p-2 text-muted hover:bg-page hover:text-ink"
          aria-label={menuOpen ? t("common.close") : t("common.menu")}
          aria-expanded={menuOpen}
          data-owner-menu
          data-owner-menu-open={menuOpen ? "1" : "0"}
        >
          {menuOpen ? (
            <X className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 lg:hidden"
          title="AROMAT PLUS"
        >
          <Image
            src="/logo-aramat-plus.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-contain"
          />
        </Link>

        {/* Desktop brand (when sidebar may be collapsed) */}
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
          className="flex max-w-[140px] flex-1 items-center gap-2 rounded-xl border border-border bg-page px-2 py-1.5 sm:max-w-[200px] sm:px-3 sm:py-2 lg:max-w-xs"
        >
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            id="owner-global-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.searchSlash")}
            className="border-0 bg-transparent p-0 text-sm shadow-none focus:ring-0"
            aria-label={t("common.globalSearch")}
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
          <LanguageSwitcher className="hidden sm:inline-flex" />

          <Link
            href="/notifications"
            className="relative rounded-xl p-2.5 text-muted hover:bg-page hover:text-ink"
            title={t("topbar.notifications")}
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
                  <p className="text-xs text-muted">{labelRole(role, t)}</p>
                  <div className="mt-2 sm:hidden">
                    <LanguageSwitcher />
                  </div>
                </div>
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-sm text-ink hover:bg-page"
                  onClick={() => setProfileOpen(false)}
                >
                  {t("common.settings")}
                </Link>
                <Link
                  href="/settings/password"
                  className="block px-3 py-2 text-sm text-ink hover:bg-page"
                  onClick={() => setProfileOpen(false)}
                >
                  {t("common.changePassword")}
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
                >
                  {t("common.exit")}
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

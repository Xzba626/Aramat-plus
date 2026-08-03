"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/components/i18n/i18n-provider";
import { BrandMark } from "@/components/company/brand-mark";
import { useCompanyBrand } from "@/components/company/company-brand-provider";
import {
  NotificationBadge,
  useUnreadNotifications,
} from "@/components/pwa/notification-badge";
import { SyncStatusDot, useSyncStatus } from "@/components/pwa/sync-status";

export function PosTopBar({
  storeName,
  companyName: companyNameProp,
}: {
  storeName?: string | null;
  companyName?: string | null;
}) {
  const { data } = useSession();
  const { t, formatDate, formatTime } = useI18n();
  const { companyName, setCompanyName } = useCompanyBrand();
  const [now, setNow] = useState(() => new Date());
  const { online, tone } = useSyncStatus();
  const { unread } = useUnreadNotifications();

  useEffect(() => {
    if (companyNameProp) setCompanyName(companyNameProp);
  }, [companyNameProp, setCompanyName]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateLabel = formatDate(now, { day: "numeric", month: "short" });
  const timeLabel = formatTime(now);
  const statusLabel =
    tone === "offline"
      ? t("pwa.offline")
      : tone === "syncing"
        ? t("pwa.syncing")
        : online
          ? t("common.online")
          : t("common.offline");

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/logo-aramat-plus.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-contain"
            priority
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-ink" title={companyName}>
              <BrandMark />
            </div>
            <div className="truncate text-xs text-muted">
              {storeName || t("common.store")} ·{" "}
              {data?.user?.name ?? t("common.seller")}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              <span>
                {dateLabel} · {timeLabel}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-ink">
                <SyncStatusDot />
                <span className="max-w-[140px] truncate">{statusLabel}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher />
          <Link
            href="/pos/notifications"
            className="relative rounded-xl p-2.5 text-muted hover:bg-page hover:text-ink"
            aria-label={t("common.notifications")}
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} />
            <NotificationBadge count={unread} />
          </Link>
        </div>
      </div>
    </header>
  );
}

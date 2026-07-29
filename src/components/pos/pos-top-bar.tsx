"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export function PosTopBar({
  storeName,
}: {
  storeName?: string | null;
}) {
  const { data } = useSession();
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const dateLabel = now.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const timeLabel = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
            <div className="truncate text-sm font-bold text-ink">
              ARAMAT <span className="text-brand">PLUS</span>
            </div>
            <div className="truncate text-xs text-muted">
              {storeName || "Магазин"} · {data?.user?.name ?? "Продавец"}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              <span>
                {dateLabel} · {timeLabel}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  online ? "text-success" : "text-danger"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    online ? "bg-success" : "bg-danger"
                  )}
                />
                {online ? "Онлайн" : "Офлайн"}
              </span>
            </div>
          </div>
        </div>
        <Link
          href="/pos/notifications"
          className="rounded-xl p-2.5 text-muted hover:bg-page hover:text-ink"
          aria-label="Уведомления"
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}

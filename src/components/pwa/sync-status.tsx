"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type SyncTone = "ok" | "syncing" | "offline";

type SyncCtx = {
  online: boolean;
  tone: SyncTone;
};

const Ctx = createContext<SyncCtx | null>(null);

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const fetching = useIsFetching();

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        /* resume — RQ refetchOnWindowFocus handles delta */
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const tone: SyncTone = !online ? "offline" : fetching > 0 ? "syncing" : "ok";
  const value = useMemo(() => ({ online, tone }), [online, tone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSyncStatus() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { online: true, tone: "ok" as SyncTone };
  }
  return ctx;
}

export function SyncStatusDot({ className }: { className?: string }) {
  const { t } = useI18n();
  const { tone } = useSyncStatus();
  const label =
    tone === "offline"
      ? t("pwa.offline")
      : tone === "syncing"
        ? t("pwa.syncing")
        : t("pwa.syncOk");
  const color =
    tone === "offline"
      ? "bg-red-500"
      : tone === "syncing"
        ? "bg-amber-400"
        : "bg-emerald-500";

  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", color)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

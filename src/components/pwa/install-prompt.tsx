"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS
      window.navigator.standalone === true;
    if (standalone) return;

    const key = "aramat:install-dismissed";
    if (sessionStorage.getItem(key) === "1") {
      setDismissed(true);
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    if (isIos) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed || (!deferred && !iosHint)) return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-3 shadow-lg sm:bottom-4">
      <p className="text-sm font-medium text-ink">{t("pwa.installTitle")}</p>
      <p className="mt-1 text-xs text-muted">
        {deferred ? t("pwa.installBody") : t("pwa.installIos")}
      </p>
      <div className="mt-3 flex gap-2">
        {deferred ? (
          <button
            type="button"
            className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white"
            onClick={async () => {
              await deferred.prompt();
              setDeferred(null);
            }}
          >
            {t("pwa.installCta")}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted"
          onClick={() => {
            sessionStorage.setItem("aramat:install-dismissed", "1");
            setDismissed(true);
          }}
        >
          {t("pwa.installLater")}
        </button>
      </div>
    </div>
  );
}

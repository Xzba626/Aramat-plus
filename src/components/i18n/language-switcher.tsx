"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  function pick(next: Locale) {
    if (next === locale) return;
    setLocale(next);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-border bg-page p-0.5 text-xs font-bold",
        className
      )}
      role="group"
      aria-label={t("lang.label")}
    >
      <button
        type="button"
        onClick={() => pick("ru")}
        className={cn(
          "rounded-lg px-2.5 py-1.5 transition",
          locale === "ru"
            ? "bg-brand text-white"
            : "text-muted hover:text-ink"
        )}
      >
        {t("lang.ru")}
      </button>
      <button
        type="button"
        onClick={() => pick("tj")}
        className={cn(
          "rounded-lg px-2.5 py-1.5 transition",
          locale === "tj"
            ? "bg-brand text-white"
            : "text-muted hover:text-ink"
        )}
      >
        {t("lang.tj")}
      </button>
    </div>
  );
}

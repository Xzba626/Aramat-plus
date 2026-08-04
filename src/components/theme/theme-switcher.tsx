"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/lib/theme";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useT();

  function pick(next: ThemeMode) {
    if (next === theme) return;
    setTheme(next);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-border bg-page p-0.5 text-xs font-bold",
        className
      )}
      role="group"
      aria-label={t("theme.label")}
    >
      <button
        type="button"
        onClick={() => pick("light")}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition",
          theme === "light"
            ? "bg-brand text-white"
            : "text-muted hover:text-ink"
        )}
        title={t("theme.light")}
      >
        <Sun className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">{t("theme.light")}</span>
      </button>
      <button
        type="button"
        onClick={() => pick("dark")}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition",
          theme === "dark"
            ? "bg-brand text-white"
            : "text-muted hover:text-ink"
        )}
        title={t("theme.dark")}
      >
        <Moon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">{t("theme.dark")}</span>
      </button>
    </div>
  );
}

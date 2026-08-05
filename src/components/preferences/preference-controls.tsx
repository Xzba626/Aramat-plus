"use client";

import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/** Shared language + theme controls for Owner / Manager / Seller. */
export function PreferenceControls({
  className,
  showLabels = false,
  layout = "row",
  showTheme = true,
}: {
  className?: string;
  showLabels?: boolean;
  layout?: "row" | "stack";
  /** Login page: language only; theme lives in Profile → Settings after sign-in. */
  showTheme?: boolean;
}) {
  const t = useT();

  return (
    <div
      className={cn(
        layout === "stack" ? "space-y-3" : "flex flex-wrap items-center gap-2",
        className
      )}
    >
      <div className={cn(layout === "stack" && "space-y-1.5")}>
        {showLabels ? (
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("lang.label")}
          </div>
        ) : null}
        <LanguageSwitcher />
      </div>
      {showTheme ? (
        <div className={cn(layout === "stack" && "space-y-1.5")}>
          {showLabels ? (
            <div className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("theme.label")}
            </div>
          ) : null}
          <ThemeSwitcher />
        </div>
      ) : null}
    </div>
  );
}

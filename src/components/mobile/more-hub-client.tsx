"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Building2,
  KeyRound,
  ScrollText,
  Settings,
  Users,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useT } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const LINKS = [
  {
    href: "/attention",
    labelKey: "dashboard.moreAttention",
    icon: AlertTriangle,
    tone: "alert" as const,
  },
  {
    href: "/notifications",
    labelKey: "nav.notifications",
    icon: Bell,
    tone: "neutral" as const,
  },
  {
    href: "/users",
    labelKey: "nav.users",
    icon: Users,
    tone: "neutral" as const,
  },
  {
    href: "/journal",
    labelKey: "nav.journal",
    icon: ScrollText,
    tone: "neutral" as const,
  },
  {
    href: "/settings/company",
    labelKey: "nav.settings",
    icon: Building2,
    tone: "neutral" as const,
  },
  {
    href: "/settings/password",
    labelKey: "common.changePassword",
    icon: KeyRound,
    tone: "neutral" as const,
  },
  {
    href: "/settings/references",
    labelKey: "dashboard.moreReferences",
    icon: BookOpen,
    tone: "neutral" as const,
  },
  {
    href: "/settings",
    labelKey: "common.settings",
    icon: Settings,
    tone: "neutral" as const,
  },
];

const TONE = {
  alert: "bg-zone-alert-soft text-zone-alert",
  neutral: "bg-page text-ink",
};

export function MoreHubClient() {
  const t = useT();

  return (
    <div className="mx-auto max-w-lg space-y-6 lg:max-w-2xl">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-ink">
          {t("dashboard.moreTitle")}
        </h2>
        <p className="text-sm text-muted">{t("dashboard.moreSubtitle")}</p>
      </header>

      <section className="rounded-[20px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
          {t("dashboard.moreLanguage")}
        </div>
        <LanguageSwitcher />
      </section>

      <section className="space-y-2">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[56px] items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)] transition active:scale-[0.99]"
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  TONE[item.tone]
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="flex-1 text-sm font-bold text-ink">
                {t(item.labelKey)}
              </span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          );
        })}
      </section>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] border border-danger/20 bg-danger/5 px-4 py-3 text-left"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <LogOut className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <span className="text-sm font-bold text-danger">{t("common.exit")}</span>
      </button>
    </div>
  );
}

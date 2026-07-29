import Link from "next/link";
import { ReactNode } from "react";

export function TopBar({
  title,
  subtitle,
  backHref,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg px-[18px] pb-3.5 pt-[18px]">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Link href={backHref} className="shrink-0 text-sm font-semibold text-gold">
            ‹ Назад
          </Link>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-text-dim">{subtitle}</div>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function AppShell({
  children,
  maxWidth = "480px",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="mx-auto flex min-h-screen flex-col bg-bg"
      style={{ maxWidth }}
    >
      {children}
    </div>
  );
}

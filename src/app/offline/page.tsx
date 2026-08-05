"use client";

import Link from "next/link";
import { BrandMark } from "@/components/company/brand-mark";
import { useT } from "@/components/i18n/i18n-provider";

export default function OfflinePage() {
  const t = useT();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0f1419] px-6 text-center text-white">
      <h1 className="text-xl font-semibold">
        <BrandMark />
      </h1>
      <p className="max-w-sm text-sm text-white/70">{t("offline.body")}</p>
      <Link
        href="/"
        className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white"
      >
        {t("offline.retry")}
      </Link>
    </main>
  );
}

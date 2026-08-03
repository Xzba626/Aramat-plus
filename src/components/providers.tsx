"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { CompanyBrandProvider } from "@/components/company/company-brand-provider";

export function Providers({
  children,
  companyName,
}: {
  children: ReactNode;
  companyName?: string | null;
}) {
  return (
    <SessionProvider>
      <I18nProvider>
        <CompanyBrandProvider initialName={companyName}>
          <ToastProvider>{children}</ToastProvider>
        </CompanyBrandProvider>
      </I18nProvider>
    </SessionProvider>
  );
}

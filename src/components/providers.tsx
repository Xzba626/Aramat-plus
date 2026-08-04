"use client";

import { ReactNode, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { CompanyBrandProvider } from "@/components/company/company-brand-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SyncStatusProvider } from "@/components/pwa/sync-status";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 60 * 24,
        refetchOnWindowFocus: true,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      },
    },
  });
}

function makePersister() {
  return createAsyncStoragePersister({
    storage: {
      getItem: async (key) => (await get(key)) ?? null,
      setItem: async (key, value) => set(key, value),
      removeItem: async (key) => del(key),
    },
    key: "aramat-rq",
  });
}

function AppProviders({
  children,
  companyName,
}: {
  children: ReactNode;
  companyName?: string | null;
}) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <I18nProvider>
          <CompanyBrandProvider initialName={companyName}>
            <SyncStatusProvider>
              <ToastProvider>
                <ServiceWorkerRegister />
                <InstallPrompt />
                {children}
              </ToastProvider>
            </SyncStatusProvider>
          </CompanyBrandProvider>
        </I18nProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

export function Providers({
  children,
  companyName,
}: {
  children: ReactNode;
  companyName?: string | null;
}) {
  const [client] = useState(makeQueryClient);
  const [persister] = useState(() =>
    typeof window !== "undefined" ? makePersister() : null
  );

  if (!persister) {
    return (
      <QueryClientProvider client={client}>
        <AppProviders companyName={companyName}>{children}</AppProviders>
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" &&
            String(q.queryKey[0] ?? "").startsWith("cache:"),
        },
      }}
    >
      <AppProviders companyName={companyName}>{children}</AppProviders>
    </PersistQueryClientProvider>
  );
}

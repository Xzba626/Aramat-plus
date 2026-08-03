"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_COMPANY_NAME,
  resolveCompanyName,
} from "@/lib/company-brand";

const EVENT = "company-brand:updated";

type Ctx = {
  companyName: string;
  setCompanyName: (name: string) => void;
  refresh: () => Promise<void>;
};

const CompanyBrandContext = createContext<Ctx | null>(null);

export function notifyCompanyBrandUpdated(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { name: resolveCompanyName(name) } })
  );
}

export function CompanyBrandProvider({
  initialName,
  children,
}: {
  initialName?: string | null;
  children: ReactNode;
}) {
  const [companyName, setCompanyNameState] = useState(
    resolveCompanyName(initialName)
  );

  const setCompanyName = useCallback((name: string) => {
    const next = resolveCompanyName(name);
    setCompanyNameState(next);
    if (typeof document !== "undefined") {
      document.title = next;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/branding");
      const data = await res.json();
      if (res.ok && typeof data?.name === "string") {
        setCompanyName(data.name);
      }
    } catch {
      /* keep current */
    }
  }, [setCompanyName]);

  useEffect(() => {
    if (initialName) setCompanyNameState(resolveCompanyName(initialName));
  }, [initialName]);

  useEffect(() => {
    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setCompanyName(detail.name);
      else void refresh();
    }
    window.addEventListener(EVENT, onUpdate);
    return () => window.removeEventListener(EVENT, onUpdate);
  }, [refresh, setCompanyName]);

  const value = useMemo(
    () => ({ companyName, setCompanyName, refresh }),
    [companyName, setCompanyName, refresh]
  );

  return (
    <CompanyBrandContext.Provider value={value}>
      {children}
    </CompanyBrandContext.Provider>
  );
}

export function useCompanyBrand() {
  const ctx = useContext(CompanyBrandContext);
  if (!ctx) {
    return {
      companyName: DEFAULT_COMPANY_NAME,
      setCompanyName: () => undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}

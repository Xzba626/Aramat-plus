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
import ru from "@/messages/ru.json";
import tj from "@/messages/tj.json";
import { translate } from "@/lib/i18n/translate";
import {
  DEFAULT_LOCALE,
  htmlLang,
  isLocale,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "@/lib/i18n/types";
import {
  formatDateLocale,
  formatDateTimeLocale,
  formatMoneyLocale,
  formatTimeLocale,
} from "@/lib/i18n/format";

type Messages = typeof ru;

const DICTS: Record<Locale, Messages> = { ru, tj };

type TParams = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TParams) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDate: (date: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number) => string;
  formatDateTime: (date: Date | string | number) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const fromLs = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(fromLs)) return fromLs;
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE_KEY}=`));
    const fromCookie = match?.split("=")[1];
    if (isLocale(fromCookie)) return fromCookie;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.cookie = `${LOCALE_COOKIE_KEY}=${locale};path=/;max-age=31536000;SameSite=Lax`;
    document.documentElement.lang = htmlLang(locale);
  } catch {
    /* ignore */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = htmlLang(stored);
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback(
    (key: string, params?: TParams) =>
      translate(DICTS[locale] as Record<string, unknown>, ru as Record<string, unknown>, key, params),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatMoney: (value, opts) => formatMoneyLocale(value, locale, opts),
      formatDate: (date, opts) => formatDateLocale(date, locale, opts),
      formatTime: (date) => formatTimeLocale(date, locale),
      formatDateTime: (date) => formatDateTimeLocale(date, locale),
    }),
    [locale, setLocale, t]
  );

  // Avoid flash of wrong locale labels after hydration
  if (!ready) {
    return (
      <I18nContext.Provider value={value}>
        <div className="contents" suppressHydrationWarning>
          {children}
        </div>
      </I18nContext.Provider>
    );
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

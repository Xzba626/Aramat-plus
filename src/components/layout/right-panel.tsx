"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/i18n-provider";

type RightPanelState = {
  isOpen: boolean;
  title: string | null;
  content: ReactNode | null;
};

type RightPanelContextValue = RightPanelState & {
  open: (content: ReactNode, title?: string) => void;
  close: () => void;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RightPanelState>({
    isOpen: false,
    title: null,
    content: null,
  });

  const open = useCallback((content: ReactNode, title?: string) => {
    setState({ isOpen: true, content, title: title ?? null });
  }, []);

  const close = useCallback(() => {
    setState({ isOpen: false, title: null, content: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, open, close }),
    [state, open, close]
  );

  return (
    <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>
  );
}

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  if (!ctx) throw new Error("useRightPanel must be used within RightPanelProvider");
  return ctx;
}

export function RightPanel() {
  const { isOpen, title, content, close } = useRightPanel();
  const t = useT();

  if (!isOpen) return null;

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-l border-border bg-card xl:flex",
        "w-[min(400px,32vw)]"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 className="truncate text-sm font-bold text-ink">
          {title ?? t("common.details")}
        </h2>
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-page hover:text-ink"
          aria-label={t("common.closePanel")}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{content}</div>
    </aside>
  );
}

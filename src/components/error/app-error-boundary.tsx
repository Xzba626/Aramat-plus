"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = { error: Error | null };

/**
 * Last-resort client boundary so a single component crash does not blank the app.
 * Prefer route-level `error.tsx` for Next.js; this wraps client provider trees.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <h2 className="text-lg font-semibold text-ink">
            {this.props.fallbackTitle ?? "Что-то пошло не так"}
          </h2>
          <p className="max-w-md text-sm text-muted">
            Интерфейс восстановлен безопасно. Обновите страницу или вернитесь
            назад.
          </p>
          <button
            type="button"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              this.setState({ error: null });
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Обновить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

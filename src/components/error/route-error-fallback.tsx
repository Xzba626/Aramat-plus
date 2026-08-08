"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold text-ink">Ошибка загрузки</h1>
      <p className="max-w-md text-sm text-muted">
        Страница не смогла отобразиться. Данные не потеряны — попробуйте ещё
        раз.
      </p>
      <Button type="button" onClick={() => reset()} fullWidth={false}>
        Повторить
      </Button>
    </div>
  );
}

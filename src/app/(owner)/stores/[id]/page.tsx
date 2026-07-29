import { Suspense } from "react";
import StoreDetailClient from "./store-detail-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">Загрузка…</div>}>
      <StoreDetailClient />
    </Suspense>
  );
}

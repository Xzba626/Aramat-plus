import { Suspense } from "react";
import PosHistoryClient from "./history-client";

export default function PosHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted">…</div>
      }
    >
      <PosHistoryClient />
    </Suspense>
  );
}

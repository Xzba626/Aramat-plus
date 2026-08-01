import { Suspense } from "react";
import ReceiveBatchClient from "./receive-client";

export default function ReceiveBatchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">…</div>}>
      <ReceiveBatchClient />
    </Suspense>
  );
}

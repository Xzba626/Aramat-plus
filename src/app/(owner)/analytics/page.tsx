import { Suspense } from "react";
import AnalyticsClient from "./analytics-client";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">…</div>}>
      <AnalyticsClient />
    </Suspense>
  );
}

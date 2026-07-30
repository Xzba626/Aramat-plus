import { Suspense } from "react";
import StoreDetailClient, { StoreDetailLoading } from "./store-detail-client";

export default function Page() {
  return (
    <Suspense fallback={<StoreDetailLoading />}>
      <StoreDetailClient />
    </Suspense>
  );
}

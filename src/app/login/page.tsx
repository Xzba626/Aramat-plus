import { Suspense } from "react";
import LoginPageClient from "./page-client";
import { LoadingBlock } from "@/components/ui/empty-state";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-text-dim">
          <LoadingBlock rows={0} />
        </div>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}

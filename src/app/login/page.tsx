import { Suspense } from "react";
import LoginPageClient from "./page-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-text-dim">Загрузка…</div>}>
      <LoginPageClient />
    </Suspense>
  );
}

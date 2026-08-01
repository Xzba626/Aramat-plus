"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FieldLabel, Card } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t("login.invalid"));
      return;
    }
    // Only relative paths — never follow absolute localhost from Auth/callback
    const raw = searchParams.get("callbackUrl") || "/";
    const callback =
      raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
    router.push(callback);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo-aramat-plus.png"
            alt="ARAMAT PLUS"
            width={220}
            height={80}
            className="mb-4 h-auto w-[200px] rounded-xl"
            priority
          />
          <p className="text-sm text-muted">{t("login.tagline")}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <FieldLabel>{t("login.email")}</FieldLabel>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <FieldLabel>{t("login.password")}</FieldLabel>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          {t("login.noSelfRegister")}
        </p>
        <p className="mt-2 text-center text-[11px] text-muted">
          {t("login.demo")}
        </p>
      </Card>
    </div>
  );
}

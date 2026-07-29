"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FieldLabel, Card } from "@/components/ui/card";

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("owner@aromat.plus");
  const [password, setPassword] = useState("owner1234");
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
      setError("Неверный логин или пароль");
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
          <p className="text-sm text-muted">Управление складом и магазинами</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <FieldLabel>Email</FieldLabel>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <FieldLabel>Пароль</FieldLabel>
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
            {loading ? "Вход…" : "Войти"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Регистрации нет — доступ выдаёт только владелец
        </p>
        <p className="mt-2 text-center text-[11px] text-muted">
          Демо: owner@aromat.plus / owner1234
        </p>
      </Card>
    </div>
  );
}

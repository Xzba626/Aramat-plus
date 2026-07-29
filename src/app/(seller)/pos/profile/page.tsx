"use client";

import { FormEvent, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PosProfilePage() {
  const { data: session } = useSession();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("currentPassword")),
        newPassword: String(fd.get("newPassword")),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Пароль изменён");
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">Профиль</h1>
      <Card className="space-y-2 p-4">
        <p className="text-sm text-muted">Имя</p>
        <p className="font-semibold text-ink">{session?.user?.name}</p>
        <p className="mt-3 text-sm text-muted">Логин</p>
        <p className="font-semibold text-ink">{session?.user?.email}</p>
        <p className="mt-2 text-xs text-muted">
          Логин меняет только владелец. Вы можете сменить пароль.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-ink">Смена пароля</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Текущий пароль</label>
            <input
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Новый пароль</label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-ink"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {msg ? <p className="text-sm text-success">{msg}</p> : null}
          <Button type="submit" className="w-full">
            Сохранить пароль
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink"
      >
        Выход
      </button>
    </div>
  );
}

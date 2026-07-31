"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useT } from "@/components/i18n/i18n-provider";
import { labelRole, apiErrorMessage } from "@/lib/i18n/labels";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  store?: { id: string; name: string } | null;
};

type Store = { id: string; name: string; kind?: string };

export default function UsersPage() {
  const t = useT();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  async function load() {
    const [uRes, sRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/stores"),
    ]);
    const uData = await uRes.json();
    const sData = await sRes.json();
    if (uRes.ok) setUsers(uData);
    else setError(uData.error || t("usersPage.errorOwner"));
    if (sRes.ok)
      setStores(
        Array.isArray(sData)
          ? sData.filter((s: Store) => s.kind !== "OWNER_DIRECT")
          : []
      );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const role = String(fd.get("role"));
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        role,
        storeId:
          role === "SELLER" ? String(fd.get("storeId") || "") || null : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "usersPage.errorOwner"));
      return;
    }
    setMsg(t("usersPage.created"));
    setShowForm(false);
    (e.target as HTMLFormElement).reset();
    load();
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (!resetId || resetPass.length < 4) {
      setError(t("usersPage.passwordShort"));
      return;
    }
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: resetId, newPassword: resetPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "usersPage.resetFail"));
      return;
    }
    setMsg(t("usersPage.passwordUpdated"));
    setResetId(null);
    setResetPass("");
  }

  const filtered = users.filter((u) => {
    const matchQ =
      !q.trim() ||
      `${u.name} ${u.email} ${u.role} ${u.store?.name ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase());
    const matchR = roleFilter === "ALL" || u.role === roleFilter;
    return matchQ && matchR;
  });

  return (
    <div>
      <PageHeader
        title={t("usersPage.title")}
        count={filtered.length || null}
        subtitle={t("usersPage.subtitle")}
        actions={
          <Button
            fullWidth={false}
            type="button"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? t("common.cancel") : t("usersPage.create")}
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg p-4">
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <FieldLabel>{t("usersPage.name")}</FieldLabel>
              <input name="name" required className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("usersPage.loginEmail")}</FieldLabel>
              <input name="email" type="email" required className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("usersPage.tempPassword")}</FieldLabel>
              <input
                name="password"
                type="password"
                required
                minLength={4}
                className="w-full"
              />
            </div>
            <div>
              <FieldLabel>{t("usersPage.role")}</FieldLabel>
              <select name="role" className="w-full" defaultValue="SELLER">
                <option value="SELLER">{t("roles.seller")}</option>
                <option value="MANAGER">{t("roles.manager")}</option>
                <option value="OWNER">{t("roles.owner")}</option>
              </select>
            </div>
            <div>
              <FieldLabel>{t("usersPage.storeForSeller")}</FieldLabel>
              <select name="storeId" className="w-full" defaultValue="">
                <option value="">{t("usersPage.storeOptional")}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{t("usersPage.storeAssignHint")}</p>
            </div>
            <Button type="submit">{t("common.save")}</Button>
          </form>
        </Card>
      ) : null}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-success">{msg}</p> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("usersPage.search")}
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="ALL">{t("usersPage.allRoles")}</option>
          <option value="OWNER">{t("roles.owner")}</option>
          <option value="MANAGER">{t("roles.manager")}</option>
          <option value="SELLER">{t("roles.seller")}</option>
        </select>
      </div>

      <SectionTitle>
        {t("usersPage.staff")} ({filtered.length})
      </SectionTitle>
      <div className="space-y-2">
        {filtered.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">{u.name}</div>
                <div className="text-xs text-muted">
                  {u.email} · {labelRole(u.role, t)}
                  {u.store ? ` · ${u.store.name}` : ""}
                  {!u.isActive ? ` · ${t("usersPage.archived")}` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                onClick={() => {
                  setResetId(u.id);
                  setResetPass("");
                  setMsg("");
                }}
              >
                {t("usersPage.resetPassword")}
              </Button>
            </div>
            {resetId === u.id ? (
              <form
                onSubmit={onReset}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <div className="min-w-[180px] flex-1">
                  <FieldLabel>{t("usersPage.newPassword")}</FieldLabel>
                  <input
                    type="password"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    minLength={4}
                    required
                    className="w-full"
                  />
                </div>
                <Button type="submit" fullWidth={false}>
                  {t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setResetId(null)}
                >
                  {t("common.cancel")}
                </Button>
              </form>
            ) : null}
          </Card>
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-muted">{t("usersPage.noUsers")}</p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { MOCK_REVISIONS } from "@/lib/ui-mocks";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type Row = (typeof MOCK_REVISIONS)[number];
type Tab = "list" | "new" | "owner-view";

type RevisionStatus = "IN_PROGRESS" | "PENDING_APPROVAL" | "APPROVED";

export default function RevisionPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("list");
  const [rows, setRows] = useState<Row[]>(MOCK_REVISIONS);
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [msg, setMsg] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchQ =
        !q.trim() ||
        `${r.store} ${r.createdBy}`.toLowerCase().includes(q.toLowerCase());
      const matchS = status === "ALL" || r.status === status;
      return matchQ && matchS;
    });
  }, [rows, q, status]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const revisionStatusLabel = (value: string) => {
    if (value === "IN_PROGRESS") return t("revisionPage.statusInProgress");
    if (value === "PENDING_APPROVAL") return t("revisionPage.statusPendingApproval");
    if (value === "APPROVED") return t("revisionPage.statusApproved");
    return value;
  };

  function startRevision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const now = new Date();
    const row: Row = {
      id: `rev-${Date.now()}`,
      date: now.toLocaleDateString(),
      store: String(fd.get("store")),
      createdBy: t("revisionPage.createdByManager"),
      status: "IN_PROGRESS",
      statusTone: "info",
      expected: "—",
      actual: "0 мл",
      diff: "—",
    };
    setRows((prev) => [row, ...prev]);
    setSelectedId(row.id);
    setTab("list");
    setMsg(t("revisionPage.subtitle"));
    (e.target as HTMLFormElement).reset();
  }

  function saveCount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData(e.currentTarget);
    const actual = `${fd.get("actual")} мл`;
    setRows((prev) =>
      prev.map((r) =>
        r.id === selected.id
          ? {
              ...r,
              actual,
              status: "PENDING_APPROVAL" as RevisionStatus,
              statusTone: "warning" as const,
              expected: "500 мл",
              diff: "−50 мл",
            }
          : r
      )
    );
    setMsg(t("revisionPage.subtitle"));
    setTab("owner-view");
  }

  function approve() {
    if (!selected) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === selected.id
          ? { ...r, status: "APPROVED" as RevisionStatus, statusTone: "success" as const }
          : r
      )
    );
    setMsg(t("revisionPage.approve"));
  }

  return (
    <ModuleWorkspace
      title={t("revisionPage.title")}
      subtitle={t("revisionPage.subtitle")}
      tabs={[
        { id: "list", label: t("revisionPage.title") },
        { id: "new", label: t("common.next") },
        { id: "owner-view", label: t("roles.owner") },
      ].map((tabItem) => ({
        ...tabItem,
        href: undefined,
      }))}
      activeTab={tab}
      kpis={[
        {
          label: t("revisionPage.actual"),
          value: String(rows.filter((r) => r.status === "IN_PROGRESS").length),
        },
        {
          label: t("revisionPage.approve"),
          value: String(rows.filter((r) => r.status === "PENDING_APPROVAL").length),
        },
        {
          label: t("revisionPage.title"),
          value: String(rows.filter((r) => r.status === "APPROVED").length),
        },
      ]}
      actions={
        <Link href="/stores">
          <Button type="button" variant="secondary" fullWidth={false}>
            {t("common.store")}
          </Button>
        </Link>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["list", "revisionPage.title"],
            ["new", "common.next"],
            ["owner-view", "roles.owner"],
          ] as const
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {msg ? <p className="mb-4 text-sm text-success">{msg}</p> : null}

      {tab === "new" ? (
        <ModuleSection title={t("revisionPage.title")}>
          <Card className="max-w-lg p-5">
            <form onSubmit={startRevision} className="space-y-3">
              <div>
                <FieldLabel>{t("common.store")}</FieldLabel>
                <select
                  name="store"
                  required
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  defaultValue="Магазин №1 Душанбе"
                >
                  <option>Магазин №1 Душанбе</option>
                  <option>Магазин №2 Худжанд</option>
                </select>
              </div>
              <div>
                <FieldLabel>{t("storeDetail.description")}</FieldLabel>
                <textarea
                  name="comment"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                />
              </div>
              <Button type="submit" fullWidth={false}>
                {t("common.next")}
              </Button>
            </form>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "list" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="min-w-[200px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="ALL">{t("storeDetail.allStatuses")}</option>
              <option value="IN_PROGRESS">{t("revisionPage.statusInProgress")}</option>
              <option value="PENDING_APPROVAL">
                {t("revisionPage.statusPendingApproval")}
              </option>
              <option value="APPROVED">{t("revisionPage.statusApproved")}</option>
            </select>
          </div>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t("storeDetail.date")}</th>
                    <th className="px-4 py-3 font-semibold">{t("common.store")}</th>
                    <th className="px-4 py-3 font-semibold">{t("roles.manager")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.colStatus")}</th>
                    <th className="px-4 py-3 font-semibold">{t("wh.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted">{r.date}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{r.store}</td>
                      <td className="px-4 py-3 text-muted">{r.createdBy}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            r.statusTone === "success" && "bg-success/10 text-success",
                            r.statusTone === "warning" && "bg-warning/15 text-warning",
                            r.statusTone === "info" && "bg-info/10 text-info"
                          )}
                        >
                          {revisionStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-sm font-semibold text-brand hover:underline"
                          onClick={() => {
                            setSelectedId(r.id);
                            setTab(r.status === "IN_PROGRESS" ? "list" : "owner-view");
                            if (r.status === "IN_PROGRESS") {
                              setSelectedId(r.id);
                            }
                          }}
                        >
                          {t("wh.open")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selected?.status === "IN_PROGRESS" ? (
            <ModuleSection title={`${t("revisionPage.actual")} · ${selected.store}`}>
              <Card className="max-w-lg border-l-4 border-l-info p-5">
                <p className="mb-3 text-sm text-muted">{t("revisionPage.subtitle")}</p>
                <form onSubmit={saveCount} className="space-y-3">
                  <div>
                    <FieldLabel>{t("wh.colName")}</FieldLabel>
                    <input
                      defaultValue="Dior Sauvage"
                      className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                      readOnly
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("revisionPage.actual")}</FieldLabel>
                    <input
                      name="actual"
                      type="number"
                      required
                      defaultValue={450}
                      className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                    />
                  </div>
                  <Button type="submit" fullWidth={false}>
                    {t("storeDetail.save")}
                  </Button>
                </form>
              </Card>
            </ModuleSection>
          ) : null}
        </>
      ) : null}

      {tab === "owner-view" ? (
        <ModuleSection title={t("revisionPage.title")}>
          {!selected ? (
            <Card className="p-5 text-sm text-muted">{t("common.noData")}</Card>
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="text-sm font-bold text-ink">{selected.store}</div>
                <div className="mt-1 text-xs text-muted">
                  {selected.date} · {selected.createdBy} · {revisionStatusLabel(selected.status)}
                </div>
              </Card>
              <Card className="overflow-hidden p-0">
                <div className="grid grid-cols-3 divide-x divide-border text-center">
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      {t("revisionPage.expected")}
                    </div>
                    <div className="mt-2 text-xl font-bold text-ink">
                      {selected.expected}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      {t("revisionPage.actual")}
                    </div>
                    <div className="mt-2 text-xl font-bold text-ink">
                      {selected.actual}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase text-muted">
                      {t("revisionPage.diff")}
                    </div>
                    <div className="mt-2 text-xl font-bold text-danger">
                      {selected.diff}
                    </div>
                  </div>
                </div>
              </Card>
              {selected.status === "PENDING_APPROVAL" ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" fullWidth={false} onClick={approve}>
                    {t("revisionPage.approve")}
                  </Button>
                  <Button type="button" variant="secondary" fullWidth={false}>
                    {t("common.back")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}

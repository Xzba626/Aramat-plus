"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { notifyCompanyBrandUpdated } from "@/components/company/company-brand-provider";

type CompanyForm = {
  id: string;
  name: string;
  currency: string;
};

export default function CompanySettingsPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masterConfigured, setMasterConfigured] = useState(false);
  const [masterHint, setMasterHint] = useState<string | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [masterHintInput, setMasterHintInput] = useState("");
  const [ownerPasswordForMaster, setOwnerPasswordForMaster] = useState("");
  const [masterMsg, setMasterMsg] = useState("");
  const [masterError, setMasterError] = useState("");
  const [masterSaving, setMasterSaving] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionMsg, setRetentionMsg] = useState("");
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [lowStock, setLowStock] = useState({
    warehousePiece: 100,
    storePiece: 20,
    storeWeightMl: 200,
    bottlePiece: 5,
  });
  const [lowStockMsg, setLowStockMsg] = useState("");
  const [lowStockSaving, setLowStockSaving] = useState(false);
  const [salesPerf, setSalesPerf] = useState({
    monthlyPieces: 10,
    monthlyMl: 200,
  });
  const [salesPerfMsg, setSalesPerfMsg] = useState("");
  const [salesPerfSaving, setSalesPerfSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/company"),
      fetch("/api/settings/wipe-master"),
      fetch("/api/settings/archive-retention"),
      fetch("/api/settings/low-stock-thresholds"),
      fetch("/api/settings/sales-performance-thresholds"),
    ])
      .then(async ([companyRes, masterRes, retRes, lowRes, salesRes]) => {
        const d = await companyRes.json();
        const m = await masterRes.json();
        const r = await retRes.json();
        const low = await lowRes.json();
        const sales = await salesRes.json();
        if (d?.id) setForm({ id: d.id, name: d.name, currency: d.currency });
        else setError(apiErrorMessage(d.error, t, "common.error"));
        if (masterRes.ok) {
          setMasterConfigured(Boolean(m.configured));
          setMasterHint(m.hint ?? null);
          setMasterHintInput(m.hint ?? "");
        }
        if (retRes.ok && typeof r.days === "number") setRetentionDays(r.days);
        if (lowRes.ok && low && typeof low.warehousePiece === "number") {
          setLowStock({
            warehousePiece: low.warehousePiece,
            storePiece: low.storePiece,
            storeWeightMl: low.storeWeightMl,
            bottlePiece: low.bottlePiece,
          });
        }
        if (salesRes.ok && sales && typeof sales.monthlyPieces === "number") {
          setSalesPerf({
            monthlyPieces: sales.monthlyPieces,
            monthlyMl: sales.monthlyMl,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        setError(t("common.error"));
        setLoading(false);
      });
  }, [t]);

  async function onSaveRetention(e: FormEvent) {
    e.preventDefault();
    setRetentionSaving(true);
    setRetentionMsg("");
    const res = await fetch("/api/settings/archive-retention", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: retentionDays }),
    });
    const data = await res.json();
    setRetentionSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setRetentionDays(data.days);
    setRetentionMsg(t("settingsSub.archiveRetentionSaved"));
  }

  async function onSaveLowStock(e: FormEvent) {
    e.preventDefault();
    setLowStockSaving(true);
    setLowStockMsg("");
    const res = await fetch("/api/settings/low-stock-thresholds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lowStock),
    });
    const data = await res.json();
    setLowStockSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setLowStock({
      warehousePiece: data.warehousePiece,
      storePiece: data.storePiece,
      storeWeightMl: data.storeWeightMl,
      bottlePiece: data.bottlePiece,
    });
    setLowStockMsg(t("settingsSub.lowStockSaved"));
  }

  async function onSaveSalesPerf(e: FormEvent) {
    e.preventDefault();
    setSalesPerfSaving(true);
    setSalesPerfMsg("");
    const res = await fetch("/api/settings/sales-performance-thresholds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(salesPerf),
    });
    const data = await res.json();
    setSalesPerfSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setSalesPerf({
      monthlyPieces: data.monthlyPieces,
      monthlyMl: data.monthlyMl,
    });
    setSalesPerfMsg(t("settingsSub.salesPerfSaved"));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, currency: form.currency }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setForm({ id: data.id, name: data.name, currency: data.currency });
    notifyCompanyBrandUpdated(data.name);
    setMsg(t("settingsSub.save"));
  }

  async function onSaveMaster(e: FormEvent) {
    e.preventDefault();
    setMasterSaving(true);
    setMasterMsg("");
    setMasterError("");
    const res = await fetch("/api/settings/wipe-master", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: masterPassword,
        hint: masterHintInput || null,
        ...(masterConfigured
          ? { currentOwnerPassword: ownerPasswordForMaster }
          : {}),
      }),
    });
    const data = await res.json();
    setMasterSaving(false);
    if (!res.ok) {
      setMasterError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMasterConfigured(Boolean(data.configured));
    setMasterHint(data.hint ?? null);
    setMasterPassword("");
    setOwnerPasswordForMaster("");
    setMasterMsg(t("settingsSub.wipeMasterSaved"));
  }

  async function onClearMaster() {
    if (!ownerPasswordForMaster) {
      setMasterError(t("wipe.needPassword"));
      return;
    }
    if (!window.confirm(t("settingsSub.wipeMasterClearConfirm"))) return;
    setMasterSaving(true);
    setMasterError("");
    const res = await fetch("/api/settings/wipe-master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerPassword: ownerPasswordForMaster }),
    });
    const data = await res.json();
    setMasterSaving(false);
    if (!res.ok) {
      setMasterError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMasterConfigured(false);
    setMasterHint(null);
    setMasterHintInput("");
    setOwnerPasswordForMaster("");
    setMasterMsg(t("settingsSub.wipeMasterCleared"));
  }

  return (
    <ModuleWorkspace
      title={t("settingsSub.company")}
      subtitle={t("settingsSub.companySubtitle")}
    >
      <ModuleSection
        title={t("settingsSub.company")}
        action={
          <Link href="/settings" className="text-sm font-semibold text-brand">
            ← {t("common.settings")}
          </Link>
        }
      >
        <Card className="max-w-xl p-5">
          {loading ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : form ? (
            <form onSubmit={onSave} className="space-y-3">
              <div>
                <FieldLabel>{t("settingsSub.name")}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev
                    )
                  }
                  required
                />
              </div>
              <div>
                <FieldLabel>{t("settingsSub.currency")}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form.currency}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, currency: e.target.value } : prev
                    )
                  }
                  required
                />
              </div>
              {msg ? <p className="text-sm text-success">{msg}</p> : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" fullWidth={false} disabled={saving}>
                {saving ? t("common.loading") : t("settingsSub.save")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-danger">{error || t("common.error")}</p>
          )}
        </Card>
      </ModuleSection>

      <ModuleSection title={t("settingsSub.lowStockTitle")}>
        <Card className="max-w-xl space-y-3 p-5">
          <p className="text-sm text-muted">{t("settingsSub.lowStockHint")}</p>
          <form onSubmit={onSaveLowStock} className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["warehousePiece", "lowStockWarehousePiece"],
                ["storePiece", "lowStockStorePiece"],
                ["storeWeightMl", "lowStockStoreWeight"],
                ["bottlePiece", "lowStockBottle"],
              ] as const
            ).map(([key, labelKey]) => (
              <div key={key}>
                <FieldLabel>{t(`settingsSub.${labelKey}`)}</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={key === "storeWeightMl" ? 1 : 1}
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={lowStock[key]}
                  onChange={(e) =>
                    setLowStock((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value) || 0,
                    }))
                  }
                  required
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button type="submit" fullWidth={false} disabled={lowStockSaving}>
                {lowStockSaving ? t("common.loading") : t("settingsSub.save")}
              </Button>
            </div>
          </form>
          {lowStockMsg ? (
            <p className="text-sm text-success">{lowStockMsg}</p>
          ) : null}
        </Card>
      </ModuleSection>

      <ModuleSection title={t("settingsSub.salesPerfTitle")}>
        <Card className="max-w-xl space-y-3 p-5">
          <p className="text-sm text-muted">{t("settingsSub.salesPerfHint")}</p>
          <form onSubmit={onSaveSalesPerf} className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>{t("settingsSub.salesPerfPieces")}</FieldLabel>
              <input
                type="number"
                min={0}
                step={1}
                className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                value={salesPerf.monthlyPieces}
                onChange={(e) =>
                  setSalesPerf((prev) => ({
                    ...prev,
                    monthlyPieces: Number(e.target.value) || 0,
                  }))
                }
                required
              />
            </div>
            <div>
              <FieldLabel>{t("settingsSub.salesPerfMl")}</FieldLabel>
              <input
                type="number"
                min={0}
                step={1}
                className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                value={salesPerf.monthlyMl}
                onChange={(e) =>
                  setSalesPerf((prev) => ({
                    ...prev,
                    monthlyMl: Number(e.target.value) || 0,
                  }))
                }
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" fullWidth={false} disabled={salesPerfSaving}>
                {salesPerfSaving ? t("common.loading") : t("settingsSub.save")}
              </Button>
            </div>
          </form>
          {salesPerfMsg ? (
            <p className="text-sm text-success">{salesPerfMsg}</p>
          ) : null}
        </Card>
      </ModuleSection>

      <ModuleSection title={t("settingsSub.archiveRetention")}>
        <Card className="max-w-xl space-y-3 p-5">
          <p className="text-sm text-muted">
            {t("settingsSub.archiveRetentionHint")}
          </p>
          <form onSubmit={onSaveRetention} className="flex flex-wrap items-end gap-3">
            <div>
              <FieldLabel>{t("settingsSub.archiveRetention")}</FieldLabel>
              <input
                type="number"
                min={1}
                max={3650}
                className="w-32 rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value) || 30)}
                required
              />
            </div>
            <Button type="submit" fullWidth={false} disabled={retentionSaving}>
              {retentionSaving ? t("common.loading") : t("settingsSub.save")}
            </Button>
          </form>
          {retentionMsg ? (
            <p className="text-sm text-success">{retentionMsg}</p>
          ) : null}
        </Card>
      </ModuleSection>

      <ModuleSection title={t("settingsSub.wipeMasterTitle")}>
        <Card className="max-w-xl space-y-3 p-5">
          <p className="text-sm text-muted">{t("settingsSub.wipeMasterDesc")}</p>
          {masterConfigured && masterHint ? (
            <p className="text-xs text-muted">
              {t("wipe.masterHintLabel")}: {masterHint}
            </p>
          ) : null}
          <form onSubmit={onSaveMaster} className="space-y-3">
            <div>
              <FieldLabel>{t("settingsSub.wipeMasterPassword")}</FieldLabel>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <FieldLabel>{t("settingsSub.wipeMasterHint")}</FieldLabel>
              <input
                className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                value={masterHintInput}
                onChange={(e) => setMasterHintInput(e.target.value)}
                placeholder={t("settingsSub.wipeMasterHintPh")}
              />
            </div>
            {masterConfigured ? (
              <div>
                <FieldLabel>{t("wipe.password")}</FieldLabel>
                <input
                  type="password"
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={ownerPasswordForMaster}
                  onChange={(e) => setOwnerPasswordForMaster(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            ) : null}
            {masterMsg ? <p className="text-sm text-success">{masterMsg}</p> : null}
            {masterError ? <p className="text-sm text-danger">{masterError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" fullWidth={false} disabled={masterSaving}>
                {masterSaving
                  ? t("common.loading")
                  : masterConfigured
                    ? t("settingsSub.wipeMasterUpdate")
                    : t("settingsSub.wipeMasterSet")}
              </Button>
              {masterConfigured ? (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={masterSaving}
                  onClick={onClearMaster}
                >
                  {t("settingsSub.wipeMasterClear")}
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}

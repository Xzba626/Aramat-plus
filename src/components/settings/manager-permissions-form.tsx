"use client";

import { FormEvent, useEffect, useState } from "react";
import { ManagerScopeMode } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/empty-state";
import { useT } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import {
  PERMISSION_UI_GROUPS,
  type ManagerPermissionKey,
} from "@/lib/permissions/keys";

type StoreRow = { id: string; name: string; kind?: string };

type Props = {
  managerId: string;
  managerName?: string;
};

const KEY_LABEL: Record<ManagerPermissionKey, string> = {
  "stores.view": "managerPerms.keyStoresView",
  "stores.create": "managerPerms.keyStoresCreate",
  "stores.edit": "managerPerms.keyStoresEdit",
  "stores.stock.bands": "managerPerms.keyStockBands",
  "sellers.view": "managerPerms.keySellersView",
  "sellers.create": "managerPerms.keySellersCreate",
  "sellers.assign": "managerPerms.keySellersAssign",
  "transfers.view": "managerPerms.keyTransfersView",
  "transfers.create": "managerPerms.keyTransfersCreate",
  "sales.view": "managerPerms.keySalesView",
  "sales.create": "managerPerms.keySalesCreate",
  "inventory.audit.view": "managerPerms.keyAuditView",
  "inventory.audit.create": "managerPerms.keyAuditCreate",
  "notifications.low_stock": "managerPerms.keyNotifLow",
  "notifications.out_of_stock": "managerPerms.keyNotifOut",
  "notifications.transfers": "managerPerms.keyNotifTransfers",
  "notifications.discrepancy": "managerPerms.keyNotifDiscrepancy",
  "notifications.audit": "managerPerms.keyNotifAudit",
};

export function ManagerPermissionsForm({ managerId, managerName }: Props) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [scopeMode, setScopeMode] = useState<ManagerScopeMode>(
    ManagerScopeMode.LEGACY_SINGLE
  );
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError("");
    const [pRes, sRes] = await Promise.all([
      fetch(`/api/managers/${managerId}/permissions`),
      fetch("/api/stores?archived=0"),
    ]);
    const pData = await pRes.json();
    const sData = await sRes.json();
    if (!pRes.ok) {
      setError(apiErrorMessage(pData.error, t, "managerPerms.loadError"));
      setLoading(false);
      return;
    }
    setScopeMode(pData.scopeMode as ManagerScopeMode);
    setStoreIds(Array.isArray(pData.storeIds) ? pData.storeIds : []);
    setPermissions(pData.permissions ?? {});
    if (sRes.ok && Array.isArray(sData)) {
      setStores(sData.map((s: StoreRow) => ({ id: s.id, name: s.name, kind: s.kind })));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId]);

  function togglePerm(key: string) {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleStore(id: string) {
    setStoreIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMsg("");
    const res = await fetch(`/api/managers/${managerId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scopeMode, storeIds, permissions }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "managerPerms.saveError"));
      return;
    }
    setPermissions(data.permissions ?? permissions);
    setScopeMode(data.scopeMode);
    setStoreIds(data.storeIds ?? []);
    setMsg(t("managerPerms.saved"));
  }

  if (loading) return <LoadingBlock />;

  return (
    <form onSubmit={onSave} className="space-y-4">
      {managerName ? (
        <p className="text-sm text-muted">
          {t("managerPerms.forUser")}: <strong className="text-ink">{managerName}</strong>
        </p>
      ) : null}

      <Card className="space-y-3 p-4">
        <SectionTitle>{t("managerPerms.scopeTitle")}</SectionTitle>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="scope"
            checked={scopeMode === ManagerScopeMode.ALL_STORES}
            onChange={() => setScopeMode(ManagerScopeMode.ALL_STORES)}
          />
          {t("managerPerms.scopeAll")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="scope"
            checked={
              scopeMode === ManagerScopeMode.SELECTED_STORES ||
              scopeMode === ManagerScopeMode.LEGACY_SINGLE
            }
            onChange={() => setScopeMode(ManagerScopeMode.SELECTED_STORES)}
          />
          {t("managerPerms.scopeSelected")}
        </label>
        {scopeMode !== ManagerScopeMode.ALL_STORES ? (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-3">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={storeIds.includes(s.id)}
                  onChange={() => toggleStore(s.id)}
                />
                {s.name}
                {s.kind === "OWNER_DIRECT" ? ` (${t("managerPerms.ownerStore")})` : ""}
              </label>
            ))}
          </div>
        ) : null}
      </Card>

      {PERMISSION_UI_GROUPS.map((group) => (
        <Card key={group.id} className="space-y-2 p-4">
          <SectionTitle>{t(group.labelKey)}</SectionTitle>
          {group.keys.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(permissions[key])}
                onChange={() => togglePerm(key)}
              />
              {t(KEY_LABEL[key])}
              {key.startsWith("sales.") ? (
                <span className="text-xs text-muted">({t("managerPerms.defaultOff")})</span>
              ) : null}
            </label>
          ))}
        </Card>
      ))}

      <Card className="space-y-2 p-4 opacity-70">
        <SectionTitle>{t("managerPerms.groupFinance")}</SectionTitle>
        <p className="text-xs text-muted">{t("managerPerms.neverGrant")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled checked={false} />
          {t("managerPerms.neverFinance")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled checked={false} />
          {t("managerPerms.neverExactStock")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled checked={false} />
          {t("managerPerms.neverApproveAudit")}
        </label>
      </Card>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {msg ? <p className="text-sm text-success">{msg}</p> : null}

      <Button type="submit" disabled={saving}>
        {saving ? "…" : t("managerPerms.save")}
      </Button>
    </form>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Sku = {
  id: string;
  name: string;
  volumeMl: number;
  material: string;
  color: string;
  defaultCost: number | null;
  isActive: boolean;
  productId: string | null;
  warehouseQty: number;
  storeQtys?: Array<{ storeId: string; storeName: string; qty: number }>;
};

type BranchStore = { id: string; name: string };
type Warehouse = { id: string; name: string };

function materialLabel(
  material: string,
  t: (k: string) => string
): string {
  if (material === "glass") return t("packaging.materialGlass");
  if (material === "plastic") return t("packaging.materialPlastic");
  return material;
}

export default function PackagingPage() {
  const { t, formatMoney } = useI18n();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === Role.OWNER;
  const [items, setItems] = useState<Sku[]>([]);
  const [stores, setStores] = useState<BranchStore[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const [skuRes, storeRes, whRes] = await Promise.all([
      fetch(`/api/packaging-skus?archived=${showInactive ? "1" : "0"}`),
      fetch("/api/stores"),
      fetch("/api/warehouses"),
    ]);
    const data = await skuRes.json();
    const storeData = await storeRes.json();
    const whData = await whRes.json();
    if (skuRes.ok) setItems(Array.isArray(data) ? data : []);
    else setError(apiErrorMessage(data.error, t));
    if (storeRes.ok && Array.isArray(storeData)) {
      setStores(
        storeData.filter(
          (s: { kind?: string; isActive?: boolean }) =>
            s.kind === "BRANCH" && s.isActive !== false
        )
      );
    }
    if (whRes.ok && Array.isArray(whData)) setWarehouses(whData);
    setLoading(false);
  }

  async function seedDefaults() {
    if (!isOwner) return;
    setError("");
    setMsg("");
    const res = await fetch("/api/packaging-skus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedDefaults: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("packaging.seedDefaultsDone"));
    load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/packaging-skus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name") || "") || undefined,
        volumeMl: Number(fd.get("volumeMl")),
        material: String(fd.get("material") || "glass"),
        color: String(fd.get("color") || "") || null,
        defaultCost: fd.get("defaultCost")
          ? Number(fd.get("defaultCost"))
          : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("packaging.created"));
    setShowForm(false);
    (e.target as HTMLFormElement).reset();
    load();
  }

  async function onReceive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const productId = String(fd.get("productId") || "");
    const quantity = Number(fd.get("quantity"));
    const sku = items.find((s) => s.productId === productId);
    const costPerUnit =
      fd.get("costPerUnit") !== null && String(fd.get("costPerUnit")) !== ""
        ? Number(fd.get("costPerUnit"))
        : (sku?.defaultCost ?? 1);
    if (!productId || !(quantity > 0) || !(costPerUnit >= 0)) {
      setError(t("errors.VALIDATION_ERROR"));
      return;
    }
    const res = await fetch(`/api/products/${productId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        costPerUnit,
        notes: "packaging receive",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("packaging.receiveDone"));
    setShowReceive(false);
    load();
  }

  async function onTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const productId = String(fd.get("productId") || "");
    const toStoreId = String(fd.get("toStoreId") || "");
    const fromWarehouseId = String(fd.get("fromWarehouseId") || "");
    const quantity = Number(fd.get("quantity"));
    if (!productId || !toStoreId || !fromWarehouseId || !(quantity > 0)) {
      setError(t("errors.VALIDATION_ERROR"));
      return;
    }
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromWarehouseId,
        toStoreId,
        items: [{ productId, quantity }],
        notes: "packaging transfer",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("packaging.transferDone"));
    setShowTransfer(false);
    load();
  }

  async function setActive(id: string, isActive: boolean) {
    setError("");
    const res = await fetch("/api/packaging-skus", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t("packaging.title")}
        subtitle={t("packaging.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              fullWidth={false}
              type="button"
              variant="secondary"
              onClick={() => {
                setShowReceive((v) => !v);
                setShowTransfer(false);
                setShowForm(false);
              }}
            >
              {showReceive ? t("common.cancel") : t("packaging.addReceive")}
            </Button>
            <Button
              fullWidth={false}
              type="button"
              variant="secondary"
              onClick={() => {
                setShowTransfer((v) => !v);
                setShowReceive(false);
                setShowForm(false);
              }}
            >
              {showTransfer ? t("common.cancel") : t("packaging.sendToStore")}
            </Button>
            {isOwner ? (
              <>
                <Button
                  fullWidth={false}
                  type="button"
                  variant="secondary"
                  onClick={seedDefaults}
                >
                  {t("packaging.seedDefaults")}
                </Button>
                <Button
                  fullWidth={false}
                  type="button"
                  onClick={() => {
                    setShowForm((v) => !v);
                    setShowReceive(false);
                    setShowTransfer(false);
                  }}
                >
                  {showForm ? t("common.cancel") : t("packaging.addSku")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {msg ? <p className="text-sm text-success">{msg}</p> : null}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        {t("packaging.showInactive")}
      </label>

      {showReceive ? (
        <Card className="p-5">
          <SectionTitle>{t("packaging.addReceive")}</SectionTitle>
          <form onSubmit={onReceive} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{t("packaging.bottleProduct")}</FieldLabel>
              <select
                name="productId"
                required
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  {t("packaging.selectBottle")}
                </option>
                {items
                  .filter((s) => s.isActive && s.productId)
                  .map((s) => (
                    <option key={s.id} value={s.productId!}>
                      {s.name}
                      {s.defaultCost != null
                        ? ` · ${formatMoney(s.defaultCost)}`
                        : ""}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("packaging.quantityPcs")}</FieldLabel>
              <input
                name="quantity"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={1000}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <FieldLabel>{t("packaging.planCost")}</FieldLabel>
              {isOwner ? (
                <input
                  name="costPerUnit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={t("packaging.defaultCost")}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
              ) : (
                <p className="mt-1 text-sm text-muted">
                  {t("packaging.defaultCostHint")}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t("packaging.addReceive")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {showTransfer ? (
        <Card className="p-5">
          <SectionTitle>{t("packaging.sendToStore")}</SectionTitle>
          <form onSubmit={onTransfer} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{t("packaging.bottleProduct")}</FieldLabel>
              <select
                name="productId"
                required
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  {t("packaging.selectBottle")}
                </option>
                {items
                  .filter((s) => s.isActive && s.productId && s.warehouseQty > 0)
                  .map((s) => (
                    <option key={s.id} value={s.productId!}>
                      {s.name} · {s.warehouseQty} {t("units.pcs")}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("packaging.transferStore")}</FieldLabel>
              <select
                name="toStoreId"
                required
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  —
                </option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("packaging.quantityPcs")}</FieldLabel>
              <input
                name="quantity"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={100}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <input
              type="hidden"
              name="fromWarehouseId"
              value={warehouses[0]?.id ?? ""}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!warehouses[0]?.id}>
                {t("packaging.sendToStore")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {showForm && isOwner ? (
        <Card className="p-5">
          <SectionTitle>{t("packaging.addSku")}</SectionTitle>
          <form onSubmit={onCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{t("packaging.nameOptional")}</FieldLabel>
              <input
                name="name"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={t("packaging.namePlaceholder")}
              />
            </div>
            <div>
              <FieldLabel>{t("packaging.volumeMl")}</FieldLabel>
              <div className="mt-1 flex items-center gap-2">
                <input
                  name="volumeMl"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
                <span className="shrink-0 text-sm font-semibold text-muted">
                  {t("packaging.volumeUnit")}
                </span>
              </div>
            </div>
            <div>
              <FieldLabel>{t("packaging.material")}</FieldLabel>
              <select
                name="material"
                defaultValue="glass"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="glass">{t("packaging.materialGlass")}</option>
                <option value="plastic">{t("packaging.materialPlastic")}</option>
              </select>
            </div>
            <div>
              <FieldLabel>{t("packaging.defaultCost")}</FieldLabel>
              <input
                name="defaultCost"
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted">
                {t("packaging.defaultCostHint")}
              </p>
            </div>
            <div>
              <FieldLabel>{t("packaging.colorOptional")}</FieldLabel>
              <input
                name="color"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                placeholder={t("packaging.color")}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{t("common.save")}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {t("packaging.empty")}
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <Card
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{s.name}</p>
                <p className="text-xs text-muted">
                  {s.volumeMl} {t("packaging.volumeUnit")} ·{" "}
                  {materialLabel(s.material, t)}
                  {s.color ? ` · ${s.color}` : ""}
                </p>
                <p className="mt-1 text-sm tabular-nums text-ink">
                  {t("packaging.warehouseStock")}: {s.warehouseQty}{" "}
                  {t("units.pcs")}
                  {s.defaultCost != null
                    ? ` · ${t("packaging.planCost")}: ${formatMoney(s.defaultCost)}`
                    : ""}
                </p>
                {s.storeQtys && s.storeQtys.length > 0 ? (
                  <div className="mt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      {t("packaging.storesStock")}
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-xs text-muted">
                      {s.storeQtys.map((st) => (
                        <li key={st.storeId} className="tabular-nums">
                          {st.storeName}: {st.qty} {t("units.pcs")}
                          {st.qty > 0 && st.qty <= 5 ? " ⚠" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setActive(s.id, !s.isActive)}
                >
                  {s.isActive ? t("common.archive") : t("common.restore")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  labelAction,
  labelActionComment,
  labelActivityActor,
  labelEntity,
  labelRole,
} from "@/lib/i18n/labels";
import type {
  ActivityLogCategory,
  ActivitySeverity,
} from "@/lib/activity-log-categories";
import { cn } from "@/lib/utils";

export type JournalLogRow = {
  id: string;
  createdAt: string;
  userName: string | null;
  role: string | null;
  action: string;
  category: ActivityLogCategory;
  severity?: ActivitySeverity;
  entityType: string;
  entityId: string | null;
  comment: string | null;
  result: string | null;
  ip?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  device?: string | null;
  email?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  details?: Array<{ key: string; value: string }>;
};

const SEVERITY_STYLE: Record<
  ActivitySeverity,
  { dot: string; labelKey: string }
> = {
  security: { dot: "bg-danger", labelKey: "journalPage.severitySecurity" },
  critical: { dot: "bg-brand", labelKey: "journalPage.severityCritical" },
  warning: { dot: "bg-warning", labelKey: "journalPage.severityWarning" },
  info: { dot: "bg-success", labelKey: "journalPage.severityInfo" },
};

function detailLabelKey(key: string): string {
  if (key === "product") return "journalPage.metaProduct";
  if (key === "quantity") return "journalPage.metaQty";
  if (key === "amount") return "journalPage.metaAmount";
  if (key === "discount") return "journalPage.metaDiscount";
  if (key === "oldPrice") return "journalPage.metaOldPrice";
  if (key === "newPrice") return "journalPage.metaNewPrice";
  if (key === "location") return "journalPage.metaLocation";
  if (key === "browser") return "journalPage.metaBrowser";
  if (key === "device") return "journalPage.device";
  return key;
}

export function JournalEventCard({ log }: { log: JournalLogRow }) {
  const { t, formatDateTime, formatMoney } = useI18n();
  const isAuthFail =
    log.action === "LOGIN_FAIL" || log.action === "LOGIN_LOCKED";
  const comment = labelActionComment(log.comment, t) ?? log.comment;
  const severity = log.severity ?? "info";
  const sev = SEVERITY_STYLE[severity];

  const details = (log.details ?? []).filter(
    (d) => d.key !== "browser" && d.key !== "device"
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-xs tabular-nums text-muted">
          {formatDateTime(log.createdAt)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-page px-2 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-border"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", sev.dot)} aria-hidden />
            {t(sev.labelKey)}
          </span>
          {log.result && log.result !== "SUCCESS" ? (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
              {log.result}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="text-base font-semibold text-ink">
          {labelAction(log.action, t)}
        </div>
        <div className="mt-1 text-sm text-muted">
          <span className="font-medium text-ink">
            {isAuthFail
              ? labelActivityActor(log, t)
              : log.userName?.trim() || t("journalPage.system")}
          </span>
          {!isAuthFail ? (
            <span>
              {" "}
              · {labelRole(log.role, t)}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
        {(log.storeName || log.storeId) && (
          <div>
            <dt className="text-xs text-muted">{t("journalPage.store")}</dt>
            <dd className="font-medium text-ink">
              {log.storeName ?? log.storeId}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">{t("journalPage.object")}</dt>
          <dd className="font-medium text-ink">
            {labelEntity(log.entityType, t)}
            {log.entityId ? ` · ${log.entityId.slice(-8).toUpperCase()}` : ""}
          </dd>
        </div>
        {details.map((d) => {
          const display =
            d.key === "amount" || d.key === "discount"
              ? (() => {
                  const n = Number(d.value);
                  return Number.isFinite(n) ? formatMoney(n) : d.value;
                })()
              : d.value;
          return (
            <div key={`${log.id}-${d.key}-${d.value}`}>
              <dt className="text-xs text-muted">{t(detailLabelKey(d.key))}</dt>
              <dd className="font-medium text-ink">{display}</dd>
            </div>
          );
        })}
        {log.browser ? (
          <div>
            <dt className="text-xs text-muted">{t("journalPage.metaBrowser")}</dt>
            <dd className="font-medium text-ink">{log.browser}</dd>
          </div>
        ) : null}
        {log.device ? (
          <div>
            <dt className="text-xs text-muted">{t("journalPage.device")}</dt>
            <dd className="font-medium text-ink">{log.device}</dd>
          </div>
        ) : null}
        {log.ip ? (
          <div>
            <dt className="text-xs text-muted">{t("journalPage.ip")}</dt>
            <dd className="font-medium text-ink tabular-nums">{log.ip}</dd>
          </div>
        ) : null}
      </dl>

      {comment ? <div className="text-sm text-muted">{comment}</div> : null}
    </Card>
  );
}

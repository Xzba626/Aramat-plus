/**
 * Journal export — CSV now; XLSX/PDF can reuse queryJournal (same filters + RBAC).
 *
 * Security:
 * - requireOwner only (same as /api/journal)
 * - companyId always from session (never from query)
 * - userId/storeId sanitized to company scope inside queryJournal
 */
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError } from "@/lib/api";
import {
  journalInputFromSearchParams,
  queryJournal,
} from "@/lib/services/journal.service";
import { labelAction, labelEntity, labelRole } from "@/lib/i18n/labels";
import {
  exportTranslate,
  resolveExportLocale,
} from "@/lib/export/csv";
import { formatDateTimeLocale } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/types";

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    if (format !== "csv") {
      return Response.json(
        {
          error: "EXPORT_FORMAT_UNSUPPORTED",
          message: "Supported now: csv. Planned: xlsx, pdf.",
        },
        { status: 400 }
      );
    }

    const locale = resolveExportLocale(req);
    const t = exportTranslate(locale);

    // Same filter parser as list API; companyId locked to session
    const input = journalInputFromSearchParams(user!.companyId, url.searchParams);
    input.page = 1;
    input.limit = Math.min(5000, Number(url.searchParams.get("limit") || 5000) || 5000);

    const { items, total } = await queryJournal(input);
    const sep = ";";
    const headers = [
      t("journalPage.colDate"),
      t("journalPage.colUser"),
      t("journalPage.colRole"),
      t("journalPage.colAction"),
      "category",
      "severity",
      t("journalPage.store"),
      t("journalPage.object"),
      "entityId",
      t("journalPage.ip"),
      t("journalPage.device"),
      "comment",
      "result",
    ];

    const lines = [headers.map(csvEscape).join(sep)];
    for (const row of items) {
      lines.push(
        [
          formatDateTimeLocale(row.createdAt, locale as Locale),
          row.userName ?? "",
          row.role ? labelRole(row.role, t) : "",
          labelAction(row.action, t),
          row.category,
          row.severity,
          row.storeName ?? row.storeId ?? "",
          labelEntity(row.entityType, t),
          row.entityId ?? "",
          row.ipDisplay ??
            (row.ipKind === "local"
              ? t("journalPage.ipLocal")
              : t("journalPage.ipUnknown")),
          [row.device, row.deviceType, row.browser, row.os]
            .filter(Boolean)
            .join(" · ") || "",
          row.comment ?? "",
          row.result ?? "",
        ]
          .map((c) => csvEscape(String(c)))
          .join(sep)
      );
    }

    const body = "\uFEFF" + lines.join("\r\n");
    const filename = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Journal-Total": String(total),
        "X-Journal-Exported": String(items.length),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

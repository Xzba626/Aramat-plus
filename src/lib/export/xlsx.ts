import ExcelJS from "exceljs";
import type { Locale } from "@/lib/i18n/types";

export type SheetColumn = {
  header: string;
  key: string;
  width?: number;
};

export async function buildXlsxBuffer(params: {
  sheetName: string;
  columns: SheetColumn[];
  rows: Array<Record<string, string | number | boolean | null | undefined>>;
  locale?: Locale;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aramat Plus";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(
    params.sheetName.slice(0, 31) || "Sheet1",
    {
      views: [{ state: "frozen", ySplit: 1 }],
    }
  );

  sheet.columns = params.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? Math.min(36, Math.max(12, c.header.length + 2)),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };

  for (const row of params.rows) {
    const values: Record<string, string | number | boolean> = {};
    for (const col of params.columns) {
      const v = row[col.key];
      values[col.key] = v == null ? "" : v;
    }
    sheet.addRow(values);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  const safe = filename.replace(/[^\w.\-а-яА-ЯёЁҷҶҳҲқҚӯӮғҒӣӢ]+/g, "_");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}

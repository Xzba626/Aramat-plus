import assert from "node:assert/strict";
import { buildXlsxBuffer } from "../src/lib/export/xlsx";

async function main() {
  const buf = await buildXlsxBuffer({
    sheetName: "Товары",
    columns: [
      { header: "Название", key: "name" },
      { header: "Сумма", key: "amount" },
    ],
    rows: [
      { name: "Test", amount: 12.5 },
      { name: "Аромат", amount: 3 },
    ],
  });
  assert.ok(buf.length > 100);
  assert.equal(buf[0], 0x50); // P
  assert.equal(buf[1], 0x4b); // K — zip/xlsx
  console.log("PASS xlsx buffer", buf.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

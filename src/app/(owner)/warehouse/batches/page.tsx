import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, decimalToNumber } from "@/lib/utils";
import Link from "next/link";
import { LocationType, Role } from "@prisma/client";
export default async function BatchesPage() {
  const session = await auth();
  const companyId = session!.user.companyId;
      const showFinance = session!.user.role === Role.OWNER;

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });

  const batches = warehouse
    ? await prisma.batch.findMany({
        where: {
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: { gt: 0 },
        },
        include: { product: { include: { brand: true, unit: true } } },
        orderBy: { receivedAt: "asc" },
        take: 100,
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Партии"
        count={batches.length}
        subtitle="FIFO · партии никогда не объединяются · двойной клик не нужен — карточка по клику"
        actions={
          <Link href="/warehouse/receive">
            <Button fullWidth={false}>+ Поступление</Button>
          </Link>
        }
      />
      <div className="space-y-2">
        {batches.map((b) => (
          <Link key={b.id} href={`/warehouse/${b.productId}`}>
            <Card className="mb-2 p-4">
              <div className="font-semibold text-ink">{b.product.name}</div>
              <div className="mt-1 text-xs text-muted">
                {new Date(b.receivedAt).toLocaleDateString("ru-RU")} · остаток{" "}
                {decimalToNumber(b.quantity)}
                {b.product.unit?.symbol ?? ""}
                {showFinance
                  ? ` · себест. ${formatMoney(decimalToNumber(b.costPerUnit))}`
                  : ""}
                {b.notes ? ` · ${b.notes}` : ""}
              </div>
            </Card>
          </Link>
        ))}
        {batches.length === 0 ? (
          <Card className="p-8 text-center text-muted">Нет партий с остатком</Card>
        ) : null}
      </div>
    </div>
 
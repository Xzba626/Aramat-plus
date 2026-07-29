import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default function WarehouseStub({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle="Центральный склад" />
      <Card className="max-w-xl p-6">
        <p className="text-sm text-muted">{description}</p>
        {href ? (
          <Link
            href={href}
            className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
          >
            {linkLabel ?? "Открыть"}
          </Link>
        ) : null}
      </Card>
    </div>
  );
}

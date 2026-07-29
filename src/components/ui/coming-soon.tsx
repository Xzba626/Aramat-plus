import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";

/** @deprecated Prefer ModuleWorkspace — kept for any legacy imports */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle="Раздел ERP" />
      <Card className="max-w-xl p-6">
        <p className="text-sm text-muted">{description}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
        >
          На главную
        </Link>
      </Card>
    </div>
  );
}

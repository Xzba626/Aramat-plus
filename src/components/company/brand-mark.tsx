"use client";

import { cn } from "@/lib/utils";
import { splitBrandForMark } from "@/lib/company-brand";
import { useCompanyBrand } from "@/components/company/company-brand-provider";

type Props = {
  /** Override (e.g. server-passed); otherwise uses CompanyBrandProvider. */
  name?: string | null;
  className?: string;
  accentClassName?: string;
};

/** Live company name from settings — never a hardcoded AROMAT/Aramat string. */
export function BrandMark({ name, className, accentClassName }: Props) {
  const { companyName } = useCompanyBrand();
  const { head, accent } = splitBrandForMark(name ?? companyName);

  return (
    <span className={cn("font-bold", className)}>
      {head}
      {accent ? (
        <>
          {" "}
          <span className={cn("text-brand", accentClassName)}>{accent}</span>
        </>
      ) : null}
    </span>
  );
}

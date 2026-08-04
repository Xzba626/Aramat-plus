import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveCompanyName } from "@/lib/company-brand";

export const COMPANY_BRAND_TAG = "company-brand";

function companyBrandTag(companyId: string) {
  return `${COMPANY_BRAND_TAG}:${companyId}`;
}

/**
 * Cached company display name for chrome (sidebar / POS top bar).
 * Cross-request cache reduces layout DB work on every soft navigation.
 * Invalidate via `revalidateCompanyBrand` after company rename.
 */
export const getCompanyBrandName = cache(async (companyId: string) => {
  return unstable_cache(
    async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      return resolveCompanyName(company?.name);
    },
    ["company-brand-name", companyId],
    {
      tags: [COMPANY_BRAND_TAG, companyBrandTag(companyId)],
      revalidate: 300,
    }
  )();
});

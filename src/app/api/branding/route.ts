import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { DEFAULT_COMPANY_NAME, resolveCompanyName } from "@/lib/company-brand";

/** Public-ish branding for chrome / login / splash. Authenticated → own company. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (user?.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      });
      return jsonOk({ name: resolveCompanyName(company?.name) });
    }

    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    return jsonOk({
      name: resolveCompanyName(company?.name ?? DEFAULT_COMPANY_NAME),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

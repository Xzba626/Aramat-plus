import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COMPANY_NAME,
  resolveCompanyName,
} from "@/lib/company-brand";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = DEFAULT_COMPANY_NAME;
  try {
    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    name = resolveCompanyName(company?.name);
  } catch {
    /* build-time */
  }

  return {
    name,
    short_name: name.length > 12 ? "Aramat" : name,
    description: name,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1419",
    theme_color: "#0f1419",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

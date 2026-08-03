import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_COMPANY_NAME,
  resolveCompanyName,
} from "@/lib/company-brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  try {
    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    const name = resolveCompanyName(company?.name);
    return { title: name, description: name };
  } catch {
    return {
      title: DEFAULT_COMPANY_NAME,
      description: DEFAULT_COMPANY_NAME,
    };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let companyName = DEFAULT_COMPANY_NAME;
  try {
    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    companyName = resolveCompanyName(company?.name);
  } catch {
    /* DB may be unavailable during build */
  }

  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers companyName={companyName}>{children}</Providers>
      </body>
    </html>
  );
}

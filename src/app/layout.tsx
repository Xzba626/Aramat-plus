import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: "#0f1419",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { createdAt: "asc" },
    });
    const name = resolveCompanyName(company?.name);
    return {
      title: name,
      description: name,
      applicationName: name,
      appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: name,
      },
      icons: {
        apple: "/icons/apple-touch-icon.png",
        icon: [
          { url: "/icons/icon-192.png", sizes: "192x192" },
          { url: "/icons/icon-512.png", sizes: "512x512" },
        ],
      },
      manifest: "/manifest.webmanifest",
    };
  } catch {
    return {
      title: DEFAULT_COMPANY_NAME,
      description: DEFAULT_COMPANY_NAME,
      manifest: "/manifest.webmanifest",
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

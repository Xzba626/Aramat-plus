"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function SplashScreen({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-sidebar transition-opacity duration-500",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div className="animate-[fadeIn_0.8s_ease-out] flex flex-col items-center text-center">
        <Image
          src="/logo-aramat-plus.png"
          alt="ARAMAT PLUS"
          width={120}
          height={120}
          className="mb-6 h-24 w-24 rounded-2xl object-contain"
          priority
        />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          AROMAT <span className="text-brand">PLUS</span>
        </h1>
        <p className="mt-1 text-sm text-white/50">Commercial Management System</p>
        <p className="mt-8 text-base font-medium text-white/80">Добро пожаловать</p>
        <div className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full origin-left animate-[splashBar_2.8s_ease-in-out] bg-brand" />
        </div>
      </div>
    </div>
  );
}

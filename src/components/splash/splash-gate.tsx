"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SplashScreen } from "@/components/splash/splash-screen";
import { homePathForRole } from "@/lib/rbac";
import type { Role } from "@prisma/client";

const SPLASH_MS = 3000;

export function SplashGate() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [splashDone, setSplashDone] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!splashDone || status === "loading") return;

    setVisible(false);
    const t = setTimeout(() => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      router.replace(homePathForRole(session.user.role as Role));
    }, 300);

    return () => clearTimeout(t);
  }, [splashDone, status, session, router]);

  return <SplashScreen visible={visible} />;
}

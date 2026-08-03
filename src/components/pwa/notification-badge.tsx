"use client";

import { useQuery } from "@tanstack/react-query";

export function useUnreadNotifications() {
  const q = useQuery({
    queryKey: ["cache:notifications-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/count");
      if (!res.ok) return { unread: 0 };
      return (await res.json()) as { unread: number };
    },
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });

  return {
    unread: q.data?.unread ?? 0,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

export function NotificationBadge({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {label}
    </span>
  );
}

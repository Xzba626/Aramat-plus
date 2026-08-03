/**
 * Stub for future Web Push fan-out.
 * Do not call from business events until VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
 */
export async function sendWebPush(_params: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<{ skipped: true; reason: string }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { skipped: true, reason: "VAPID_NOT_CONFIGURED" };
  }
  return { skipped: true, reason: "SEND_NOT_WIRED" };
}

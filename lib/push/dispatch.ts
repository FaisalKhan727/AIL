import { prisma } from "@/lib/prisma";
import { getWebPush } from "./vapid";

export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the guard app to open when the user taps the notification. */
  url?: string;
  /** Arbitrary metadata for the service worker to read. */
  data?: Record<string, unknown>;
  tag?: string;
}

export interface PushResult {
  ok: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  /** True when there were subscriptions but every one of them failed. */
  allFailed: boolean;
}

/**
 * Send a push notification to every active subscription on a GuardAccount.
 *
 * - 404/410 from the push service means the subscription is gone — we delete it.
 * - Other failures increment failureCount; after 3 consecutive failures we mark
 *   the GuardAccount as not-app-activated so future dispatches fall back to SMS.
 * - Returns allFailed=true if there were subscriptions but none delivered, so
 *   the caller can fall back to SMS for THIS send.
 */
export async function sendPushToGuardAccount(
  guardAccountId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const webpush = getWebPush();
  const subs = await prisma.pushSubscription.findMany({
    where: { guardAccountId },
  });

  if (subs.length === 0) {
    return { ok: false, attempted: 0, succeeded: 0, failed: 0, allFailed: false };
  }

  const payloadJson = JSON.stringify(payload);
  let succeeded = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
        },
        payloadJson,
      );
      succeeded++;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: {
          lastSuccessfulPushAt: new Date(),
          failureCount: 0,
        },
      });
    } catch (err: unknown) {
      failed++;
      const statusCode =
        typeof err === "object" && err !== null && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : undefined;

      if (statusCode === 404 || statusCode === 410) {
        // Subscription is dead — drop it.
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      } else {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: {
            lastFailedPushAt: new Date(),
            failureCount: { increment: 1 },
          },
        });
      }
    }
  }

  const allFailed = succeeded === 0 && subs.length > 0;

  if (allFailed) {
    await prisma.guardAccount.update({
      where: { id: guardAccountId },
      data: { appActivated: false },
    });
  }

  return {
    ok: succeeded > 0,
    attempted: subs.length,
    succeeded,
    failed,
    allFailed,
  };
}

/**
 * Decide whether a specific Guard (company-scoped record) should receive its
 * next shift notification via push or SMS.
 *
 * Push iff:
 *   - The Guard has a GuardIdentity
 *   - That identity has a GuardAccount with appActivated=true
 *   - That GuardAccount has at least one PushSubscription
 *   - The CompanyAppDispatch for this Guard is enabled (default true)
 *   - GuardPreferences.notificationsEnabled is true (default true)
 *
 * Otherwise SMS.
 */
export async function pickChannelForGuard(
  guardId: string,
): Promise<{ channel: "PUSH"; guardAccountId: string } | { channel: "SMS" }> {
  const guard = await prisma.guard.findUnique({
    where: { id: guardId },
    select: {
      guardIdentityId: true,
      appDispatch: { select: { enabled: true } },
      guardIdentity: {
        select: {
          account: {
            select: {
              id: true,
              appActivated: true,
              preferences: { select: { notificationsEnabled: true } },
              _count: { select: { pushSubscriptions: true } },
            },
          },
        },
      },
    },
  });

  if (!guard?.guardIdentityId) return { channel: "SMS" };

  const account = guard.guardIdentity?.account;
  if (!account?.appActivated) return { channel: "SMS" };
  if (account._count.pushSubscriptions === 0) return { channel: "SMS" };
  if (account.preferences && !account.preferences.notificationsEnabled) {
    return { channel: "SMS" };
  }
  // appDispatch row may not exist yet; absence is treated as enabled
  if (guard.appDispatch && !guard.appDispatch.enabled) return { channel: "SMS" };

  return { channel: "PUSH", guardAccountId: account.id };
}

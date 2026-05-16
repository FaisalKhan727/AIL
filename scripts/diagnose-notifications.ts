/**
 * scripts/diagnose-notifications.ts
 *
 * Trace the entire push notification chain for one guard's phone number
 * and report which link, if any, is broken.
 *
 * Usage:
 *   npx tsx scripts/diagnose-notifications.ts +61478835774
 */

import { PrismaClient } from "@prisma/client";

const phone = process.argv[2];
if (!phone || !/^\+\d{8,15}$/.test(phone)) {
  console.error("Usage: npx tsx scripts/diagnose-notifications.ts +61478835774");
  process.exit(1);
}

function status(ok: boolean, label: string, detail = "") {
  console.log(`${ok ? " ✓" : " ✗"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("");
    console.log(`=== Notification chain diagnosis for ${phone} ===`);
    console.log("");

    // STEP 1: GuardIdentity exists
    const identity = await prisma.guardIdentity.findUnique({
      where: { phone },
      include: {
        account: {
          include: {
            preferences: true,
            sessions: { where: { revokedAt: null }, orderBy: { lastUsedAt: "desc" }, take: 5 },
            pushSubscriptions: true,
          },
        },
        employments: {
          where: { active: true },
          include: {
            company: { select: { name: true } },
            appDispatch: true,
          },
        },
      },
    });

    status(!!identity, "GuardIdentity exists");
    if (!identity) {
      console.log("\nNo GuardIdentity for this phone. Has the backfill run? Is the phone correct (E.164)?");
      return;
    }
    console.log(`     id: ${identity.id}  name: ${identity.firstName} ${identity.lastName}`);
    console.log(`     companies: ${identity.employments.map((e) => e.company.name).join(", ")}`);
    console.log("");

    // STEP 2: GuardAccount exists
    const account = identity.account;
    status(!!account, "GuardAccount exists (means setup was completed)");
    if (!account) {
      console.log("\nGuard never completed /g/setup/<token>. Either the SMS link wasn't tapped, or setup failed midway.");
      console.log("Action: send a new invite from admin and walk through setup on the device that will receive pushes.");
      return;
    }
    console.log(`     id: ${account.id}`);
    console.log(`     activatedAt: ${account.activatedAt?.toISOString() ?? "—"}`);
    console.log(`     lastSeenAt:  ${account.lastSeenAt?.toISOString() ?? "—"}`);
    console.log(`     suspendedAt: ${account.suspendedAt?.toISOString() ?? "—"}`);
    console.log("");

    // STEP 3: appActivated flag
    status(account.appActivated, "GuardAccount.appActivated = true");
    if (!account.appActivated) {
      console.log("\nappActivated got flipped to false — usually means an earlier push failed for every subscription.");
      console.log("Action: have the guard re-open /g on the device they want pushes on. Subscribe handler will set it back to true.");
    }
    console.log("");

    // STEP 4: Active sessions
    status(account.sessions.length > 0, `Has ${account.sessions.length} active session(s)`);
    for (const s of account.sessions) {
      const expired = s.expiresAt < new Date();
      console.log(
        `     session ${s.id.slice(0, 8)}…  expires=${s.expiresAt.toISOString().slice(0, 16)}  ${expired ? "EXPIRED" : "ok"}  ua=${(s.userAgent ?? "").slice(0, 60)}`,
      );
    }
    console.log("");

    // STEP 5: Push subscriptions — the critical one
    const subs = account.pushSubscriptions;
    status(subs.length > 0, `Has ${subs.length} push subscription(s)`);
    if (subs.length === 0) {
      console.log("\nNO PUSH SUBSCRIPTION EXISTS. This is almost certainly why nothing arrives.");
      console.log("Causes:");
      console.log("  - The device never reached /g (only completed setup, didn't continue).");
      console.log("  - Notification permission was denied → SW couldn't subscribe.");
      console.log("  - SW failed to register (iOS requires Add-to-Home-Screen first).");
      console.log("  - The /g page subscribe call hit an error (check browser console).");
      console.log("");
      console.log("Action: on the receiving device, open https://myshift.auswidesecurityexperts.com.au/g");
      console.log("Sign in. Allow notifications when prompted. Reload. Run this script again.");
    } else {
      for (const sub of subs) {
        const host = (() => {
          try {
            return new URL(sub.endpoint).hostname;
          } catch {
            return "?";
          }
        })();
        const stale = sub.lastFailedPushAt && sub.lastSuccessfulPushAt && sub.lastFailedPushAt > sub.lastSuccessfulPushAt;
        console.log(`     ${host}  device=${(sub.deviceLabel ?? "").slice(0, 40)}`);
        console.log(`     lastOK=${sub.lastSuccessfulPushAt?.toISOString().slice(0, 16) ?? "—"}  lastFAIL=${sub.lastFailedPushAt?.toISOString().slice(0, 16) ?? "—"}  failureCount=${sub.failureCount}  ${stale ? "[STALE]" : ""}`);
      }
    }
    console.log("");

    // STEP 6: Preferences
    if (account.preferences) {
      status(account.preferences.notificationsEnabled, "GuardPreferences.notificationsEnabled = true");
    } else {
      status(true, "GuardPreferences absent (defaults to enabled)");
    }
    console.log("");

    // STEP 7: Per-company dispatch toggles
    console.log("Per-company channel decision:");
    for (const emp of identity.employments) {
      const dispatchEnabled = emp.appDispatch?.enabled ?? true;
      const subsExist = subs.length > 0;
      const accountReady = account.appActivated && (account.preferences?.notificationsEnabled ?? true);
      const wouldPush = subsExist && accountReady && dispatchEnabled;
      console.log(
        `  ${wouldPush ? "→ PUSH" : "→ SMS "}  ${emp.company.name.padEnd(20)}  appDispatch=${dispatchEnabled}  guardId=${emp.id}`,
      );
    }
    console.log("");

    // STEP 8: Recent dispatch attempts for this guard (last 10 SmsLog rows)
    const guardIds = identity.employments.map((e) => e.id);
    const recent = await prisma.smsLog.findMany({
      where: { guardId: { in: guardIds } },
      orderBy: { receivedAt: "desc" },
      take: 5,
      select: {
        direction: true,
        body: true,
        status: true,
        receivedAt: true,
        guardId: true,
      },
    });
    console.log("Recent SmsLog rows (for this guard, last 5):");
    for (const r of recent) {
      console.log(
        `  ${r.receivedAt.toISOString().slice(0, 19)}  ${r.direction.padEnd(8)}  ${(r.status ?? "").padEnd(8)}  ${r.body.slice(0, 60).replace(/\n/g, " ")}`,
      );
    }
    console.log("");

    // STEP 9: VAPID env vars present?
    const hasPublic = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const hasPrivate = !!process.env.VAPID_PRIVATE_KEY;
    const hasSubject = !!process.env.VAPID_SUBJECT;
    status(hasPublic && hasPrivate && hasSubject, "VAPID env vars in local .env");
    if (!(hasPublic && hasPrivate && hasSubject)) {
      console.log("     (this script reads .env, not Vercel — so this only tells you about your laptop)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

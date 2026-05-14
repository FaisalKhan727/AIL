import { NextResponse } from "next/server";
import { requireGuard } from "@/lib/guard-auth";
import { VAPID_PUBLIC_KEY } from "@/lib/push/vapid";

export async function GET() {
  const result = await requireGuard();
  if (!result.ok) return result.response;
  const { guard } = result;
  return NextResponse.json({
    identity: {
      id: guard.guardIdentityId,
      firstName: guard.firstName,
      lastName: guard.lastName,
      phone: guard.phone,
    },
    memberships: guard.memberships,
    vapidPublicKey: VAPID_PUBLIC_KEY,
  });
}

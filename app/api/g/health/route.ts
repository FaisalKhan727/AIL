import { NextResponse } from "next/server";

/**
 * Unauthenticated health endpoint for the guard PWA.
 * Reports presence (not values) of the env vars the PWA depends on.
 * No secrets are leaked — only booleans.
 */
export async function GET() {
  return NextResponse.json({
    vapidPublicKeySet: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivateKeySet: Boolean(process.env.VAPID_PRIVATE_KEY),
    vapidSubjectSet: Boolean(process.env.VAPID_SUBJECT),
    publicBaseUrlSet: Boolean(process.env.PUBLIC_BASE_URL),
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    vapidPublicKeyLength: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").length,
  });
}

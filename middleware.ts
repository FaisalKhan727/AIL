export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protect every route EXCEPT:
     *   - /login
     *   - /api/auth/*
     *   - /api/sms/* (Twilio webhooks; verified by adapter)
     *   - /g/* (guard PWA, has its own session cookie + per-route requireGuard)
     *   - /api/g/* (guard API, validated by requireGuard())
     *   - /onboarding/* (public token-authenticated guard onboarding)
     *   - /api/onboarding/* (same, validated by token in URL)
     *   - /api/cron/* (Vercel Cron, validated by CRON_SECRET bearer)
     *   - static files
     */
    "/((?!login|api/auth|api/sms|g(?:/|$)|api/g(?:/|$)|onboarding(?:/|$)|api/onboarding(?:/|$)|api/cron(?:/|$)|_next/static|_next/image|favicon.ico).*)",
  ],
};

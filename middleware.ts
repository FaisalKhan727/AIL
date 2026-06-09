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
     *   - static files
     */
    "/((?!login|api/auth|api/sms|g(?:/|$)|api/g(?:/|$)|onboarding(?:/|$)|api/onboarding(?:/|$)|_next/static|_next/image|favicon.ico).*)",
  ],
};

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
     *   - static files
     */
    "/((?!login|api/auth|api/sms|g(?:/|$)|api/g(?:/|$)|_next/static|_next/image|favicon.ico).*)",
  ],
};

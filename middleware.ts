export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * Protect every route EXCEPT:
     *   - /login
     *   - /api/auth/*
     *   - /api/sms/* (Twilio webhooks; verified by adapter)
     *   - static files
     */
    "/((?!login|api/auth|api/sms|_next/static|_next/image|favicon.ico).*)",
  ],
};

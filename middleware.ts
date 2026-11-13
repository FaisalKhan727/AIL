import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";

const adminAuth = withAuth({ pages: { signIn: "/login" } });

// The guard app (/m, /api/m) shares the NextAuth session cookie but handles
// its own sign-in: its layout and route handlers check for a guard session,
// so an unauthenticated guard lands on /m/login rather than the admin login.
function isGuardApp(pathname: string): boolean {
  return pathname === "/m" || pathname.startsWith("/m/") || pathname.startsWith("/api/m/");
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isGuardApp(req.nextUrl.pathname)) return NextResponse.next();
  return adminAuth(req as NextRequestWithAuth, event);
}

export const config = {
  matcher: [
    /*
     * Run on every route EXCEPT:
     *   - /login
     *   - /api/auth/*
     *   - /api/sms/* (Twilio webhooks; verified by adapter)
     *   - /api/cron/* (authenticated with CRON_SECRET)
     *   - static files, the PWA manifests and icons
     */
    "/((?!login|api/auth|api/sms|api/cron|_next/static|_next/image|favicon.ico|manifest.json|guard.webmanifest|icon-).*)",
  ],
};

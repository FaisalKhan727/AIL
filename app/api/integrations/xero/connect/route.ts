import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { signState } from "@/lib/crypto";
import { authorizeUrl, xeroConfigured } from "@/lib/integrations/xero";

// Starts the Xero OAuth flow. The signed state ties the callback to this
// company and this browser.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (auth.role !== "OWNER") return jsonError("Only an owner can connect accounting software.", 403);
  if (!xeroConfigured()) return jsonError("Set XERO_CLIENT_ID and XERO_CLIENT_SECRET first.", 400);
  const state = signState(auth.companyId);
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("xero_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/integrations/xero" });
  return res;
}

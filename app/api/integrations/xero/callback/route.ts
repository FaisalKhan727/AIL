import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/api";
import { verifyState } from "@/lib/crypto";
import { completeConnection } from "@/lib/integrations/xero";
import { logSync } from "@/lib/server/accounting";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations?${q}`, process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || url.origin));
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const state = url.searchParams.get("state") ?? "";
  const cookieState = cookies().get("xero_state")?.value ?? "";
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Xero connection was cancelled.")}`);
  if (!state || state !== cookieState || verifyState(state) !== auth.companyId) {
    return back(`error=${encodeURIComponent("The Xero sign-in link expired or didn't match. Try connecting again.")}`);
  }
  const code = url.searchParams.get("code");
  if (!code) return back(`error=${encodeURIComponent("Xero didn't return an authorisation code.")}`);
  try {
    const name = await completeConnection(auth.companyId, code, auth.session.user.name || "Admin");
    const res = back(`connected=${encodeURIComponent(name)}`);
    res.cookies.delete("xero_state");
    return res;
  } catch (e) {
    const m = e instanceof Error ? e.message : "Connection failed";
    await logSync(auth.companyId, "XERO", "CONNECT", false, m);
    return back(`error=${encodeURIComponent(m)}`);
  }
}

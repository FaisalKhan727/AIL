import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { billableJobs } from "@/lib/server/invoices";
import { dateOnly } from "@/lib/server/ops";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!clientId || !from || !to) return jsonError("clientId, from and to are required", 400);
  return NextResponse.json(await billableJobs(auth.companyId, clientId, dateOnly(from), dateOnly(to)));
}

import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { billableJobs, billableShifts } from "@/lib/server/invoices";
import { dateOnly } from "@/lib/server/ops";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const sp = new URL(req.url).searchParams;
  const clientId = sp.get("clientId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!clientId || !from || !to) return jsonError("clientId, from and to are required", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return jsonError("Dates must be yyyy-MM-dd", 400);
  const [jobs, hourly] = await Promise.all([billableJobs(auth.companyId, clientId, dateOnly(from), dateOnly(to)), billableShifts(auth.companyId, clientId, from, to)]);
  return NextResponse.json({ jobs, ...hourly });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/api";
import { disconnect } from "@/lib/integrations/xero";
import { earningsRates, matchEmployees, pushInvoices, pushPayRun, syncPayments } from "@/lib/integrations/xero-sync";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invoices"), ids: z.array(z.string()).min(1).max(200) }),
  z.object({ action: z.literal("payments") }),
  z.object({ action: z.literal("employees") }),
  z.object({ action: z.literal("earnings-rates") }),
  z.object({ action: z.literal("payrun"), payRunId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation", 400);
  const a = parsed.data;
  try {
    switch (a.action) {
      case "invoices": return NextResponse.json({ results: await pushInvoices(auth.companyId, a.ids) });
      case "payments": return NextResponse.json(await syncPayments(auth.companyId));
      case "employees": return NextResponse.json(await matchEmployees(auth.companyId));
      case "earnings-rates": return NextResponse.json({ rates: await earningsRates(auth.companyId) });
      case "payrun": return NextResponse.json(await pushPayRun(auth.companyId, a.payRunId));
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Xero request failed", 502);
  }
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  if (auth.role !== "OWNER") return jsonError("Only an owner can disconnect accounting software.", 403);
  await disconnect(auth.companyId);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { normaliseAccounting } from "@/lib/exports";
import { saveAccounting } from "@/lib/server/accounting";

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("validation", 400);
  const s = normaliseAccounting(body);
  await saveAccounting(auth.companyId, s);
  return NextResponse.json(s);
}

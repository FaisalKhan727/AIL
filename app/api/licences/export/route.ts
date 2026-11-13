import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/licences";
import { licenceInclude, serialiseLicence } from "@/lib/server/licences";

// Compliance register as CSV — what an auditor or a client tender asks for.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const rows = await prisma.licence.findMany({
    where: { companyId: auth.companyId },
    include: licenceInclude,
    orderBy: [{ guard: { lastName: "asc" } }, { type: "asc" }],
  });
  const now = new Date();
  const csv = Papa.unparse(
    rows.map((r) => {
      const l = serialiseLicence(r, now);
      return {
        Guard: l.guardName,
        "Guard active": l.guardActive ? "Yes" : "No",
        Credential: l.typeLabel,
        Number: l.number,
        State: l.state,
        Issued: l.issueDate ?? "",
        Expires: l.expiryDate ?? "",
        "Days left": l.daysLeft ?? "",
        Status: STATUS_LABEL[l.status],
        "Verified by": l.verifiedBy ?? "",
        "Verified on": l.verifiedAt ? l.verifiedAt.toISOString().slice(0, 10) : "",
        Method: l.verifyMethod ?? "",
        Note: l.verifyNote ?? "",
        "Document on file": l.document ? "Yes" : "No",
      };
    }),
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="compliance-register-${now.toISOString().slice(0, 10)}.csv"`,
    },
  });
}

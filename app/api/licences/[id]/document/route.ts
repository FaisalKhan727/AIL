import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";

// Serves the uploaded licence image / PDF. Readable by admins of the owning
// company and by the guard the licence belongs to.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.companyId) return jsonError("unauthorized", 401);

  const licence = await prisma.licence.findFirst({
    where: {
      id: params.id,
      companyId: session.user.companyId,
      ...(session.user.role === "GUARD" ? { guardId: session.user.id } : {}),
    },
    include: { document: true },
  });
  if (!licence?.document) return jsonError("not found", 404);

  return new Response(new Uint8Array(licence.document.data), {
    headers: {
      "content-type": licence.document.mime,
      "content-disposition": `inline; filename="${licence.document.name.replace(/[^\w.-]+/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

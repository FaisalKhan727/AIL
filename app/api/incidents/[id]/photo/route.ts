import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const inc = await prisma.incident.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: { photo: true } });
  if (!inc?.photo) return jsonError("not found", 404);
  return new Response(new Uint8Array(inc.photo.data), {
    headers: { "content-type": inc.photo.mime, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
}

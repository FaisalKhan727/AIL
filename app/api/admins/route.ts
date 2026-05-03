import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admins = await prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(admins);
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["OWNER", "MANAGER"]).default("MANAGER"),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  // OWNER only.
  const role = (auth.session.user as { role?: string }).role;
  if (role !== "OWNER") return jsonError("OWNER role required", 403);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("validation", 400, parsed.error.flatten());
  const { email, name, password, role: newRole } = parsed.data;
  try {
    const created = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: await bcrypt.hash(password, 10),
        role: newRole,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "create failed";
    if (msg.includes("Unique")) return jsonError("email already exists", 409);
    return jsonError(msg, 500);
  }
}

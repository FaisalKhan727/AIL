import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface AdminAuth {
  session: Session;
  userId: string;
  companyId: string;
  role: string;
}

export async function requireAdmin(): Promise<{ error: NextResponse } | AdminAuth> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.companyId) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  // Guard-app sessions share the NextAuth cookie but must never reach an
  // admin endpoint.
  if (session.user.role === "GUARD") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return {
    session,
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role ?? "MANAGER",
  };
}

export interface GuardAuth {
  guardId: string;
  companyId: string;
}

/** Guard-app endpoints: a signed-in guard whose record is still active. */
export async function requireGuard(): Promise<{ error: NextResponse } | GuardAuth> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "GUARD") {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const guard = await prisma.guard.findFirst({
    where: { id: session.user.id, companyId: session.user.companyId, active: true },
    select: { id: true, companyId: true },
  });
  if (!guard) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { guardId: guard.id, companyId: guard.companyId };
}

export function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

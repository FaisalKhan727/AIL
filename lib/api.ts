import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
  return {
    session,
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role ?? "MANAGER",
  };
}

export function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

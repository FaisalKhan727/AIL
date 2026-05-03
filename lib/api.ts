import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export function jsonError(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GUARD_SESSION_COOKIE, hashToken } from "@/lib/guard-auth";

export async function POST() {
  const cookie = cookies().get(GUARD_SESSION_COOKIE);
  if (cookie?.value) {
    const tokenHash = hashToken(cookie.value);
    await prisma.guardSession
      .update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GUARD_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return response;
}

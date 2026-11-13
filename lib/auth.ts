import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeOtp, normalisePhone } from "@/lib/guard-otp";

// Session lasts ~1 year and is refreshed once per active day. The JWT cookie
// is set with the same maxAge, so it survives browser/app restarts on mobile
// — the user stays signed in until they explicitly tap Sign out.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const ONE_DAY_SECONDS = 60 * 60 * 24;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: ONE_YEAR_SECONDS,
    updateAge: ONE_DAY_SECONDS,
  },
  jwt: {
    maxAge: ONE_YEAR_SECONDS,
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.adminUser.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        };
      },
    }),
    // Guards sign in to the mobile app (/m) with their mobile number and a
    // one-time SMS code. Their session carries role GUARD, which every admin
    // API rejects (see requireAdmin).
    CredentialsProvider({
      id: "guard-otp",
      name: "Guard",
      credentials: {
        phone: { label: "Mobile", type: "tel" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const phone = normalisePhone(credentials?.phone ?? "");
        const code = (credentials?.code ?? "").trim();
        if (!phone || !code) return null;
        if (!(await consumeOtp(phone, code))) return null;
        const guard = await prisma.guard.findFirst({
          where: { phone, active: true },
          orderBy: { createdAt: "desc" },
        });
        if (!guard) return null;
        return {
          id: guard.id,
          email: null,
          name: `${guard.firstName} ${guard.lastName}`,
          role: "GUARD",
          companyId: guard.companyId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // A guard who works for more than one company on the same mobile number
      // can switch between them. The target must be an active guard record
      // with the same phone as the one they proved ownership of.
      if (trigger === "update" && token.role === "GUARD" && token.uid) {
        const wanted = (session as { guardId?: unknown } | undefined)?.guardId;
        if (typeof wanted === "string" && wanted !== token.uid) {
          const current = await prisma.guard.findUnique({ where: { id: token.uid } });
          const target = current
            ? await prisma.guard.findFirst({ where: { id: wanted, phone: current.phone, active: true } })
            : null;
          if (target) {
            token.uid = target.id;
            token.companyId = target.companyId;
            token.name = `${target.firstName} ${target.lastName}`;
          }
        }
      }
      if (user) {
        const u = user as { id?: string; role?: string; companyId?: string };
        token.uid = u.id;
        token.role = u.role ?? "MANAGER";
        token.companyId = u.companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as { id?: string; role?: string; companyId?: string };
        su.id = token.uid as string;
        su.role = token.role as string;
        su.companyId = token.companyId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

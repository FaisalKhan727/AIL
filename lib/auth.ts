import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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
  ],
  callbacks: {
    async jwt({ token, user }) {
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

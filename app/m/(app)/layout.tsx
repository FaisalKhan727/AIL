import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GuardShell } from "@/components/guard-app/shell";

export default async function GuardAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/m/login");
  // An admin who wanders in here belongs in the console.
  if (session.user.role !== "GUARD") redirect("/dashboard");
  // Deactivated guards lose access straight away, not when their token expires.
  const guard = await prisma.guard.findFirst({ where: { id: session.user.id, active: true }, select: { id: true } });
  if (!guard) redirect("/m/login?ended=1");
  return <GuardShell>{children}</GuardShell>;
}

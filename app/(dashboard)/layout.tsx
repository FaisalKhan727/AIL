import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) redirect("/login");

  const setting = await prisma.setting.findUnique({
    where: { companyId_key: { companyId: session.user.companyId, key: "company_name" } },
  });
  const companyName = setting?.value || process.env.COMPANY_NAME || "Vigilo";

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar companyName={companyName} />
      <main className="md:pl-64">
        <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

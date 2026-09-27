import Link from "next/link";
import { ClipboardList, Wallet, FileText, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTS = [
  {
    href: "/timesheets",
    icon: ClipboardList,
    title: "Timesheets",
    description: "Hours worked per guard per week, with CSV export.",
  },
  {
    href: "/payroll",
    icon: Wallet,
    title: "Payroll",
    description: "Paid / pending pay by guard, with financial statement export.",
  },
  {
    href: "/invoices",
    icon: FileText,
    title: "Invoices",
    description: "Alarm-response invoicing by client and billing period.",
  },
];

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational exports live in their own modules today — this hub will grow into cross-module reporting"
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href}>
              <Card className="card-interactive h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-navy/10 text-brand-navy">
                      <Icon className="h-4 w-4" />
                    </span>
                    {r.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{r.description}</CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <Card className="mt-4">
        <CardContent className="pt-6 flex items-start gap-3 text-sm text-muted-foreground">
          <BarChart3 className="h-5 w-5 shrink-0 mt-0.5" />
          <p>
            A dedicated cross-module reporting builder (roster fill rate, guard reliability,
            site cost trends) is planned but not yet built — for now, the existing exports above
            cover payroll and invoicing.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

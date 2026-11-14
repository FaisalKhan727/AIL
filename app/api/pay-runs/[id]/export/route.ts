import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/api";
import { employmentHeroCsv, myobTimesheetTsv, payRunSummaryCsv, type ExportPayLine } from "@/lib/exports";
import { actualTimes, getPaySettings } from "@/lib/server/payroll";
import { logSync } from "@/lib/server/accounting";

// Download a finalised pay run for a payroll system.
//   summary          — hours and dollars by pay category (any system, or a bookkeeper)
//   myob             — MYOB AccountRight timesheet import, hours by category and day
//   employment-hero  — raw start/finish times; Employment Hero applies its own award rules
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const format = new URL(req.url).searchParams.get("format");
  if (!["summary", "myob", "employment-hero"].includes(format ?? "")) return jsonError("Unknown format", 400);
  const run = await prisma.payRun.findFirst({ where: { id: params.id, companyId: auth.companyId }, include: { lines: { orderBy: [{ guardId: "asc" }, { workDate: "asc" }] } } });
  if (!run) return jsonError("not found", 404);
  if (run.status !== "FINALISED") return jsonError("Finalise the pay run before exporting it.", 409);
  const guards = await prisma.guard.findMany({ where: { id: { in: Array.from(new Set(run.lines.map((l) => l.guardId))) } } });
  const G = new Map(guards.map((g) => [g.id, g]));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const meta = { number: run.number, periodStart: ymd(run.periodStart), periodEnd: ymd(run.periodEnd), payDate: ymd(run.payDate) };
  const lines: ExportPayLine[] = run.lines.map((l) => {
    const g = G.get(l.guardId)!;
    return {
      guardName: `${g.firstName} ${g.lastName}`, firstName: g.firstName, lastName: g.lastName, payrollRef: g.payrollRef, employmentType: g.employmentType,
      workDate: ymd(l.workDate), category: l.category, hours: Number(l.hours), baseRate: Number(l.baseRate), multiplier: Number(l.multiplier),
      amount: Number(l.amount), superable: l.superable, note: l.note,
    };
  }).sort((a, b) => a.guardName.localeCompare(b.guardName) || a.workDate.localeCompare(b.workDate));

  let body: string, name: string, type = "text/csv; charset=utf-8";
  if (format === "summary") { body = payRunSummaryCsv(lines, meta); name = `pay-run-${run.number}.csv`; }
  else if (format === "myob") { body = myobTimesheetTsv(lines); name = `pay-run-${run.number}-myob-timesheets.txt`; type = "text/tab-separated-values; charset=utf-8"; }
  else {
    const { tz } = await getPaySettings(auth.companyId);
    const shifts = await prisma.shift.findMany({ where: { payRunId: run.id }, include: { guard: true, site: true }, orderBy: { startAt: "asc" } });
    body = employmentHeroCsv(shifts.map((s) => {
      const t = actualTimes(s);
      return {
        payrollRef: s.guard?.payrollRef ?? null, guardName: s.guard ? `${s.guard.firstName} ${s.guard.lastName}` : "",
        date: formatInTimeZone(t.start, tz, "yyyy-MM-dd"), startTime: formatInTimeZone(t.start, tz, "HH:mm"),
        endDate: formatInTimeZone(t.end, tz, "yyyy-MM-dd"), endTime: formatInTimeZone(t.end, tz, "HH:mm"),
        breakMins: s.breakMins, location: s.site.name, workType: s.role ?? "", comments: s.tsNote ?? "",
      };
    }));
    name = `pay-run-${run.number}-employment-hero.csv`;
  }
  const label = { summary: "Summary CSV", myob: "MYOB timesheets", "employment-hero": "Employment Hero timesheets" }[format!];
  await prisma.payRun.update({ where: { id: run.id }, data: { exportedAt: new Date(), exportedTo: label } });
  await logSync(auth.companyId, format === "myob" ? "MYOB" : format === "employment-hero" ? "EMPLOYMENT_HERO" : "FILE", "PAYRUN", true, `Pay run ${run.number} downloaded as ${label}`, run.id);
  return new Response(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"` } });
}

import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type LicenceStatus } from "@/lib/licences";
import { cn } from "@/lib/utils";

const TONE: Record<LicenceStatus, string> = {
  VALID: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  EXPIRING: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  URGENT: "bg-red-500/15 text-red-300 border-red-500/40",
  EXPIRED: "bg-red-500/30 text-red-100 border-red-500/70",
  UNVERIFIED: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  REJECTED: "bg-muted text-muted-foreground border-border line-through",
};

export function LicenceStatusBadge({ status, className }: { status: LicenceStatus; className?: string }) {
  return <Badge className={cn(TONE[status], className)}>{STATUS_LABEL[status]}</Badge>;
}

/** "in 12 days" / "3 days ago" / "today" */
export function daysLabel(days: number | null): string {
  if (days === null) return "No expiry";
  if (days === 0) return "today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** yyyy-MM-dd -> dd/MM/yyyy */
export function auDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneAU(p: string): string {
  // Just for display; storage stays E.164.
  if (p.startsWith("+61") && p.length === 12) {
    return `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}`;
  }
  return p;
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "APPROVED":
    case "PAID":
    case "PUBLISHED":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "WORKED":
      // Darker green so it's distinct from CONFIRMED at a glance.
      return "bg-emerald-500/25 text-emerald-300 border-emerald-500/40";
    case "REJECTED":
      return "bg-red-500/15 text-red-300 border-red-500/40";
    case "NO_SHOW":
      // Stronger / more saturated so the operator's eye lands on no-shows
      // first when scanning the timesheet view.
      return "bg-rose-500/25 text-rose-300 border-rose-500/40 font-semibold";
    case "CANCELLED":
      return "bg-muted text-muted-foreground border-border line-through";
    case "PENDING":
    case "DRAFT":
      return "bg-amber-500/15 text-amber-300 border-amber-500/40";
    case "ARCHIVED":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

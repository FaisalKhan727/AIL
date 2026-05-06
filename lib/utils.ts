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
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "WORKED":
      // Darker green so it's distinct from CONFIRMED at a glance.
      return "bg-emerald-200 text-emerald-900 border-emerald-400";
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-300";
    case "NO_SHOW":
      // Stronger / more saturated so the operator's eye lands on no-shows
      // first when scanning the timesheet view.
      return "bg-rose-200 text-rose-900 border-rose-400 font-semibold";
    case "CANCELLED":
      return "bg-zinc-100 text-zinc-600 border-zinc-300 line-through";
    case "PENDING":
    case "DRAFT":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "ARCHIVED":
      return "bg-zinc-100 text-zinc-600 border-zinc-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

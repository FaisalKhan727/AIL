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
    case "WORKED":
    case "APPROVED":
    case "PAID":
    case "PUBLISHED":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "REJECTED":
    case "NO_SHOW":
    case "CANCELLED":
      return "bg-red-100 text-red-800 border-red-300";
    case "PENDING":
    case "DRAFT":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "ARCHIVED":
      return "bg-zinc-100 text-zinc-600 border-zinc-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

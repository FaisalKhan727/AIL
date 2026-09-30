import { Badge } from "@/components/ui/badge";

const STYLES: Record<string, { label: string; className: string }> = {
  VERIFIED: { label: "LARS verified", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  NOT_FOUND: { label: "Not on LARS", className: "bg-red-100 text-red-800 border-red-300" },
  NAME_MISMATCH: { label: "LARS name mismatch", className: "bg-red-100 text-red-800 border-red-300" },
  EXPIRED: { label: "LARS expired", className: "bg-red-100 text-red-800 border-red-300" },
  ERROR: { label: "LARS check failed", className: "bg-amber-100 text-amber-800 border-amber-300" },
};

export function LicenceCheckBadge({ status, title }: { status: string | null; title?: string | null }) {
  if (!status) return <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300">Not checked</Badge>;
  const s = STYLES[status] ?? { label: status, className: "bg-zinc-100 text-zinc-700 border-zinc-300" };
  return <Badge className={s.className} title={title ?? undefined}>{s.label}</Badge>;
}

import { Badge } from "@/components/ui/badge";
import { statusBadgeClass } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusBadgeClass(status)}>
      {/* bg-current picks up whatever text-* colour statusBadgeClass sets,
          so the dot always matches without duplicating the colour map. */}
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {status}
    </Badge>
  );
}

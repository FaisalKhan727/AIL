import { Badge } from "@/components/ui/badge";
import { statusBadgeClass } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusBadgeClass(status)}>{status}</Badge>;
}

import { cn } from "@/lib/utils";
import { STATUS_VISUAL, type ShiftStatus } from "@/lib/g/design";

interface Props {
  status: ShiftStatus;
  className?: string;
  /** Slightly larger for hero cards / detail page. */
  size?: "sm" | "md";
}

export function StatusPill({ status, className, size = "sm" }: Props) {
  const v = STATUS_VISUAL[status];
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        size === "sm" ? "text-[10px] px-2 py-0.5 tracking-wide uppercase" : "text-xs px-2.5 py-1",
        v.badge,
        className,
      )}
    >
      {v.label}
    </span>
  );
}

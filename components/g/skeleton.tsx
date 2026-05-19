import { cn } from "@/lib/utils";

/**
 * Loading placeholder block. Use to render the SHAPE of upcoming content
 * (not a generic spinner) so the page layout doesn't jump when data arrives.
 *
 * Usage: <Skeleton className="h-4 w-32" />
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-skeleton-pulse rounded bg-slate-200 dark:bg-slate-700",
        className,
      )}
      aria-hidden
    />
  );
}

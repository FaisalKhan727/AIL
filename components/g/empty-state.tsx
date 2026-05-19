import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  /** Lucide icon component, rendered at 32px inside a soft circle. */
  icon: LucideIcon;
  /** Short heading — 1-4 words. */
  title: string;
  /** Subtext explaining what to do next. */
  description?: string;
  /** Optional tiny stats line below the description (e.g., "2 shifts last week"). */
  metaLine?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Friendly empty-state block. Used when there are no shifts, no incidents,
 * no recent activity etc. Anchored visually so the page never feels
 * "broken" — always shows a calm icon, a useful headline, and a hint
 * about what to expect.
 */
export function EmptyState({ icon: Icon, title, description, metaLine, className, children }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center py-8 px-6 rounded-2xl",
        "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
        <Icon className="h-8 w-8 text-slate-500 dark:text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">{description}</p>
      )}
      {metaLine && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{metaLine}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

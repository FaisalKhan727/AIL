"use client";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  /** Hex string. When provided, sets the chip's left-side dot + active fill. */
  colour?: string | null;
  active: boolean;
  onClick?: () => void;
}

/**
 * Pill-shaped tap target for the company switcher row. Active chip is
 * filled with the company colour; inactive is outlined with a small
 * coloured dot indicator.
 *
 * Used in a horizontally-scrolling row at the top of the guard PWA.
 */
export function CompanyChip({ label, colour, active, onClick }: Props) {
  const stroke = colour ?? "#0B1E3F";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
        "text-xs font-medium whitespace-nowrap transition-colors",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        active
          ? "text-white border-transparent"
          : "text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700",
      )}
      style={active ? { backgroundColor: stroke } : undefined}
      aria-pressed={active}
    >
      {!active && colour && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: stroke }}
        />
      )}
      {label}
    </button>
  );
}

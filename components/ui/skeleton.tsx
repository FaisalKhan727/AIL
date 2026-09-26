import * as React from "react";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";

/** A single pulsing placeholder block. Use to shape a loading state after
 *  the real content it stands in for (e.g. w-24 for a name, w-12 for a
 *  status pill) so the page doesn't visibly reflow once data arrives. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-skeleton-pulse rounded-md bg-muted", className)} {...props} />;
}

/**
 * Drop-in replacement for a "Loading…" <TableRow> — renders `rows` rows of
 * `columns` pulsing cells so a data table keeps its shape (and the page
 * doesn't jump) while the query is in flight, instead of a single centred
 * line of text.
 */
export function TableSkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4" style={{ width: `${55 + ((r * 7 + c * 13) % 35)}%` }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Same idea for a mobile card list (Guards/Sites "card per row" views). */
export function CardSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Whole-page placeholder for a detail/dashboard route that currently
 * blocks on `if (isLoading) return <div>Loading…</div>` — a header bar, a
 * row of stat/summary cards, and a content block, roughly matching the
 * shape most of these pages settle into once data arrives. Cheap to render
 * and a lot less jarring than a single line of grey text on an otherwise
 * blank page.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

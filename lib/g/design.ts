/**
 * Guard PWA design system tokens.
 *
 * Colours come from Tailwind classes; this file is for *programmatic*
 * lookups (per-company colours, status mappings) that can't be expressed
 * as static class names.
 *
 * For static styling, prefer Tailwind utility classes directly — that
 * keeps Tailwind's tree-shaking working and avoids runtime style juggling.
 */

import type { Shift } from "@prisma/client";

// -----------------------------------------------------------------------------
// Per-company colours
// -----------------------------------------------------------------------------

/**
 * Stable colour for a company. Used for the left-edge stripe on shift cards,
 * the active-chip background in the company switcher, and the hero header
 * gradient on shift detail pages.
 *
 * Source of truth: Company.brandColour in the DB (admin-settable). This
 * function provides a deterministic fallback so the UI never shows a flat
 * neutral when the admin hasn't picked a colour yet.
 */
export function companyColour(brandColour: string | null | undefined, companyId?: string): string {
  if (brandColour && /^#[0-9a-f]{6}$/i.test(brandColour)) return brandColour;
  // Deterministic fallback: hash companyId into the palette.
  if (!companyId) return FALLBACK_PALETTE[0];
  let h = 0;
  for (let i = 0; i < companyId.length; i++) h = (h * 31 + companyId.charCodeAt(i)) | 0;
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length];
}

const FALLBACK_PALETTE = [
  "#0B1E3F", // navy (Auswide default)
  "#0D9488", // teal (ACS default)
  "#7C3AED", // purple
  "#DB2777", // pink
  "#EA580C", // orange
  "#65A30D", // lime
  "#0891B2", // cyan
  "#9333EA", // violet
  "#CA8A04", // yellow
  "#BE123C", // crimson
  "#15803D", // emerald
  "#1D4ED8", // royal blue
];

// -----------------------------------------------------------------------------
// Shift status mapping
// -----------------------------------------------------------------------------

export type ShiftStatus = Shift["status"];

export interface StatusVisual {
  /** Tailwind classes for the status badge background + text. */
  badge: string;
  /** Plain English label shown on the badge. */
  label: string;
  /** Hex colour used for the timeline event marker. */
  hex: string;
}

export const STATUS_VISUAL: Record<ShiftStatus, StatusVisual> = {
  PENDING: {
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
    label: "Pending",
    hex: "#F59E0B",
  },
  CONFIRMED: {
    badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
    label: "Confirmed",
    hex: "#10B981",
  },
  REJECTED: {
    badge: "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300",
    label: "Declined",
    hex: "#EF4444",
  },
  WORKED: {
    badge: "bg-emerald-200 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-200",
    label: "Worked",
    hex: "#059669",
  },
  NO_SHOW: {
    badge: "bg-rose-200 text-rose-900 dark:bg-rose-500/20 dark:text-rose-300",
    label: "No-show",
    hex: "#BE123C",
  },
  CANCELLED: {
    badge: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
    label: "Cancelled",
    hex: "#64748B",
  },
};

// -----------------------------------------------------------------------------
// Time helpers
// -----------------------------------------------------------------------------

/**
 * Human-friendly countdown to a future timestamp. "in 4h 22m", "in 2 days",
 * "starting now", or "ended Xh ago" for past shifts.
 */
export function timeUntil(target: Date | string): string {
  const t = typeof target === "string" ? new Date(target) : target;
  const ms = t.getTime() - Date.now();
  const absMin = Math.abs(Math.round(ms / 60000));
  if (Math.abs(ms) < 60_000) return "starting now";
  const sign = ms >= 0 ? "in " : "";
  const suffix = ms >= 0 ? "" : " ago";
  if (absMin < 60) return `${sign}${absMin}m${suffix}`;
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  if (h < 24) {
    return m === 0 ? `${sign}${h}h${suffix}` : `${sign}${h}h ${m}m${suffix}`;
  }
  const days = Math.floor(h / 24);
  return `${sign}${days} day${days === 1 ? "" : "s"}${suffix}`;
}

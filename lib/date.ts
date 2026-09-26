import { format, toZonedTime, fromZonedTime } from "date-fns-tz";

export const APP_TZ = process.env.APP_TIMEZONE || "Australia/Melbourne";

export function fmtInTz(d: Date | string, pattern: string, tz = APP_TZ): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(toZonedTime(date, tz), pattern, { timeZone: tz });
}

export function fmtDateTime(d: Date | string): string {
  return fmtInTz(d, "EEE d MMM, HH:mm");
}

export function fmtTime(d: Date | string): string {
  return fmtInTz(d, "HH:mm");
}

export function fmtDate(d: Date | string): string {
  return fmtInTz(d, "EEE d MMM");
}

export function fmtIso(d: Date | string): string {
  return fmtInTz(d, "yyyy-MM-dd");
}

/** Treat a "yyyy-MM-ddTHH:mm" local input as APP_TZ wall time. */
export function localInputToUtc(localIso: string, tz = APP_TZ): Date {
  return fromZonedTime(localIso, tz);
}

/** Format a UTC Date as "yyyy-MM-ddTHH:mm" in APP_TZ for <input type="datetime-local">. */
export function utcToLocalInput(d: Date | string, tz = APP_TZ): string {
  return fmtInTz(d, "yyyy-MM-dd'T'HH:mm", tz);
}

/**
 * Start of the Mon-Sun week containing `d`, as a UTC instant representing
 * midnight in `tz`.
 *
 * This must be timezone-aware, not based on the server's local clock: on a
 * server running in UTC (e.g. a Vercel function), a shift at say 00:30
 * Monday Melbourne time is still Sunday afternoon in UTC. Computing the week
 * boundary from `.getDay()`/`.setHours()` directly would put that shift —
 * and its hours — in the wrong week's timesheet. Everywhere else in this
 * file already goes through `toZonedTime`/`fromZonedTime` for exactly this
 * reason; this pair was the one place that didn't, which is why totals
 * computed in production (UTC servers) could disagree with totals computed
 * in local dev (already Australia-zoned).
 */
export function startOfWeekMon(d: Date, tz: string = APP_TZ): Date {
  const local = toZonedTime(d, tz);
  const day = local.getDay(); // 0..6, 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const startLocal = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + diff,
    0, 0, 0, 0,
  );
  return fromZonedTime(startLocal, tz);
}

export function endOfWeekSun(d: Date, tz: string = APP_TZ): Date {
  const start = startOfWeekMon(d, tz);
  const startLocal = toZonedTime(start, tz);
  const endLocal = new Date(
    startLocal.getFullYear(),
    startLocal.getMonth(),
    startLocal.getDate() + 6,
    23, 59, 59, 999,
  );
  return fromZonedTime(endLocal, tz);
}

/** Midnight at the start of the calendar day containing `d`, in `tz`. */
export function startOfDayInTz(d: Date, tz: string = APP_TZ): Date {
  const local = toZonedTime(d, tz);
  const startLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0);
  return fromZonedTime(startLocal, tz);
}

/** The last millisecond of the calendar day containing `d`, in `tz`. */
export function endOfDayInTz(d: Date, tz: string = APP_TZ): Date {
  const local = toZonedTime(d, tz);
  const endLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 23, 59, 59, 999);
  return fromZonedTime(endLocal, tz);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

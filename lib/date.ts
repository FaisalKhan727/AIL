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

export function startOfWeekMon(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0..6, 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeekSun(d: Date): Date {
  const start = startOfWeekMon(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

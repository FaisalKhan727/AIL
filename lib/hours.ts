export interface HoursShift {
  status: string;
  startAt: Date;
  endAt: Date;
  workedStart?: Date | null;
  workedEnd?: Date | null;
  /** Admin-entered exact payable hours for this one shift. When set, this
   *  wins over everything else (worked times, scheduled times) — it's an
   *  explicit correction, so nothing should second-guess it. */
  hoursOverride?: number | null;
  /** Per-shift pay rate ($/hr). When set, used instead of the guard's
   *  default rate for this shift only — e.g. a higher-paying site, an
   *  event loading, one day at a different rate than the rest of the week. */
  payRateOverride?: number | null;
}

const PAYABLE = new Set(["CONFIRMED", "WORKED"]);

// Suspiciously short clock-in/out windows are treated as accidental
// mis-taps and fall back to the scheduled times. Found in production
// after a guard's "Mon 1 Jun" shift recorded a 12-second worked window
// that silently zeroed out a 12-hour shift in the timesheet view.
//
// Real shifts almost never end within 15 minutes of clock-in; if a
// genuine ultra-short shift is needed, an admin can correct the worked
// times via the Mark-worked flow.
const MIN_WORKED_MS = 15 * 60 * 1000;

export function shiftHours(shift: HoursShift): number {
  if (!PAYABLE.has(shift.status)) return 0;

  if (shift.hoursOverride != null) {
    const h = Number(shift.hoursOverride);
    return h > 0 ? Math.round(h * 100) / 100 : 0;
  }

  let start = shift.startAt;
  let end = shift.endAt;
  if (shift.workedStart && shift.workedEnd) {
    const workedMs = shift.workedEnd.getTime() - shift.workedStart.getTime();
    if (workedMs >= MIN_WORKED_MS) {
      start = shift.workedStart;
      end = shift.workedEnd;
    }
    // else: ignore the worked window, fall back to scheduled
  } else if (shift.workedStart && !shift.workedEnd) {
    // Currently clocked in. Use worked-in time as the start; if scheduled
    // end has passed it'll show full hours, otherwise it'll show partial.
    start = shift.workedStart;
  } else if (!shift.workedStart && shift.workedEnd) {
    // Unusual: clocked out with no clock-in recorded. Use scheduled start
    // through the recorded worked end.
    end = shift.workedEnd;
  }

  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** The rate actually paid for this shift: its own override if set, else
 *  the guard's default rate. */
export function shiftPayRate(shift: HoursShift, guardDefaultRate: number): number {
  return shift.payRateOverride != null ? Number(shift.payRateOverride) : guardDefaultRate;
}

/** Pay for one shift — its own hours at its own effective rate. */
export function shiftPay(shift: HoursShift, guardDefaultRate: number): number {
  return Math.round(shiftHours(shift) * shiftPayRate(shift, guardDefaultRate) * 100) / 100;
}

export function totalHours(shifts: HoursShift[]): number {
  return Math.round(shifts.reduce((sum, s) => sum + shiftHours(s), 0) * 100) / 100;
}

/**
 * Total pay across shifts at `guardDefaultRate`, except any shift with its
 * own payRateOverride is paid at that rate instead — so a guard who worked
 * one day at a special rate and the rest of the week at their usual rate
 * gets both reflected correctly in the same weekly total.
 */
export function totalPay(shifts: HoursShift[], guardDefaultRate: number): number {
  return Math.round(shifts.reduce((sum, s) => sum + shiftPay(s, guardDefaultRate), 0) * 100) / 100;
}

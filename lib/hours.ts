export interface HoursShift {
  status: string;
  startAt: Date;
  endAt: Date;
  workedStart?: Date | null;
  workedEnd?: Date | null;
}

const PAYABLE = new Set(["CONFIRMED", "WORKED"]);

export function shiftHours(shift: HoursShift): number {
  if (!PAYABLE.has(shift.status)) return 0;
  const start = shift.workedStart ?? shift.startAt;
  const end = shift.workedEnd ?? shift.endAt;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function totalHours(shifts: HoursShift[]): number {
  return Math.round(shifts.reduce((sum, s) => sum + shiftHours(s), 0) * 100) / 100;
}

export function totalPay(shifts: HoursShift[], payRate: number): number {
  return Math.round(totalHours(shifts) * payRate * 100) / 100;
}

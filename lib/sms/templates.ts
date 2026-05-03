import { format, toZonedTime } from "date-fns-tz";

export interface ShiftLineInput {
  index: number;
  startAt: Date;
  endAt: Date;
  siteName: string;
  role?: string | null;
}

export interface RosterMessageInput {
  firstName: string;
  rosterName: string;
  shifts: ShiftLineInput[];
  firstConfirmCode: string;
  template?: string; // editable template from Setting table
  timezone?: string;
}

export const DEFAULT_ROSTER_TEMPLATE = `Hi {firstName}, your shifts for {rosterName}:

{shiftList}

Reply with shift # + YES/NO for each.
E.g. "1 YES, 2 NO, 3 YES"
Or reply ALL YES / ALL NO.

Ref: {firstConfirmCode}`;

export const DEFAULT_REPLY_SUMMARY_TEMPLATE = `Thanks {firstName}. Confirmed: {confirmedCount}, Rejected: {rejectedCount}, Pending: {pendingCount}.`;

export const DEFAULT_UNPARSED_TEMPLATE = `Hi {firstName}, we couldn't read your reply. Please reply with shift # then YES or NO (e.g. "1 YES, 2 NO") or ALL YES / ALL NO.`;

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function formatShiftLine(s: ShiftLineInput, tz: string): string {
  const start = toZonedTime(s.startAt, tz);
  const end = toZonedTime(s.endAt, tz);
  const dayStr = format(start, "EEE d MMM", { timeZone: tz });
  const startStr = format(start, "HH:mm", { timeZone: tz });
  const endStr = format(end, "HH:mm", { timeZone: tz });
  const role = s.role ? ` (${s.role})` : "";
  return `${s.index}) ${dayStr}, ${startStr}–${endStr} — ${s.siteName}${role}`;
}

export function buildRosterMessage(input: RosterMessageInput): string {
  const tpl = input.template || DEFAULT_ROSTER_TEMPLATE;
  const tz = input.timezone || "Australia/Melbourne";
  const shiftList = input.shifts.map((s) => formatShiftLine(s, tz)).join("\n");
  return fillTemplate(tpl, {
    firstName: input.firstName,
    rosterName: input.rosterName,
    shiftList,
    firstConfirmCode: input.firstConfirmCode,
  });
}

export interface ReplySummaryInput {
  firstName: string;
  confirmedCount: number;
  rejectedCount: number;
  pendingCount: number;
  template?: string;
}

export function buildReplySummary(input: ReplySummaryInput): string {
  const tpl = input.template || DEFAULT_REPLY_SUMMARY_TEMPLATE;
  return fillTemplate(tpl, {
    firstName: input.firstName,
    confirmedCount: String(input.confirmedCount),
    rejectedCount: String(input.rejectedCount),
    pendingCount: String(input.pendingCount),
  });
}

export function buildUnparsedReply(firstName: string, template?: string): string {
  const tpl = template || DEFAULT_UNPARSED_TEMPLATE;
  return fillTemplate(tpl, { firstName });
}

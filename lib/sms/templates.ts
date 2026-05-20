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

// ---------------------------------------------------------------------------
// Alarm dispatch templates
// ---------------------------------------------------------------------------

export interface AlarmMessageInput {
  docket: string;
  alarmType: string; // BURGLARY | FIRE | etc — passed through human-readable
  priority: string; // LOW | MEDIUM | HIGH | CRITICAL
  siteName: string;
  siteAddress: string;
  description?: string | null;
  specialInstructions?: string | null;
  /** Optional override from Setting key `sms_template_alarm`. */
  template?: string;
}

export const DEFAULT_ALARM_TEMPLATE = `ALARM #{docket}
{alarmType} - {priority}
{siteName}
{siteAddress}{descriptionBlock}{instructionsBlock}

Reply: ONSITE time OFFSITE time RESULT
Eg: ONSITE 1147 OFFSITE 1213 ALL GOOD AND SECURE`;

/**
 * Build the outbound alarm SMS body. Tries to keep the message under
 * 320 characters (2 SMS segments) by truncating the description first.
 * Special instructions are kept intact — they often contain critical
 * info like gate codes that must NOT be truncated.
 */
export function buildAlarmMessage(input: AlarmMessageInput): string {
  const tpl = input.template || DEFAULT_ALARM_TEMPLATE;

  // Format priority labels — make HIGH/CRITICAL eye-catching.
  const priorityLabel = input.priority.toUpperCase();
  const alarmTypeLabel = input.alarmType.replace(/_/g, " ").toUpperCase();

  // Compose with conditional blocks (so missing description / instructions
  // don't leave dangling newlines).
  const descriptionBlock = input.description?.trim() ? `\n${input.description.trim()}` : "";
  const instructionsBlock = input.specialInstructions?.trim()
    ? `\n\n${input.specialInstructions.trim()}`
    : "";

  let body = fillTemplate(tpl, {
    docket: input.docket,
    alarmType: alarmTypeLabel,
    priority: priorityLabel,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    descriptionBlock,
    instructionsBlock,
  });

  // Truncate description if total body > 320 chars. Special instructions
  // stay intact; reply line stays intact; only the description content
  // gets shortened.
  const HARD_LIMIT = 320;
  if (body.length > HARD_LIMIT && descriptionBlock) {
    const overage = body.length - HARD_LIMIT + 3; // +3 for the "..."
    const trimmed = (input.description ?? "").trim().slice(0, Math.max(0, descriptionBlock.length - overage)) + "...";
    body = fillTemplate(tpl, {
      docket: input.docket,
      alarmType: alarmTypeLabel,
      priority: priorityLabel,
      siteName: input.siteName,
      siteAddress: input.siteAddress,
      descriptionBlock: trimmed ? `\n${trimmed}` : "",
      instructionsBlock,
    });
  }

  return body;
}

// Auto-replies sent by the inbound parser after a responder's SMS lands.
export const ALARM_REPLY_COMPLETED = "Thanks. Docket #{docket} closed.";
export const ALARM_REPLY_ACKNOWLEDGED = "Confirmed. Send onsite/offsite times when done.";
export const ALARM_REPLY_UNPARSED =
  "Got it — could you confirm onsite/offsite times? Eg: ONSITE 1147 OFFSITE 1213 ALL GOOD.";

export function buildAlarmAutoReply(kind: "completed" | "acknowledged" | "unparsed", docket?: string): string {
  if (kind === "completed") return fillTemplate(ALARM_REPLY_COMPLETED, { docket: docket ?? "" });
  if (kind === "acknowledged") return ALARM_REPLY_ACKNOWLEDGED;
  return ALARM_REPLY_UNPARSED;
}

// Licence & compliance rules. Everything in this file is pure (no database,
// no network) so the same logic drives the API, the admin console, the guard
// app and the unit tests.

export const DAY_MS = 86_400_000;

export interface LicenceTypeDef {
  key: string;
  label: string;
  short: string;
  /** Holding one of these is what legally lets a guard work a security shift. */
  security: boolean;
  /** Types that never expire can be VALID without an expiry date. */
  expires: boolean;
}

export const LICENCE_TYPES: LicenceTypeDef[] = [
  { key: "SECURITY_1A", label: "Security Licence — Unarmed Guard", short: "Unarmed Guard", security: true, expires: true },
  { key: "SECURITY_1B", label: "Security Licence — Armed Guard", short: "Armed Guard", security: true, expires: true },
  { key: "SECURITY_2A", label: "Security Licence — Crowd Controller", short: "Crowd Controller", security: true, expires: true },
  { key: "SECURITY_2B", label: "Security Licence — Bodyguard", short: "Bodyguard", security: true, expires: true },
  { key: "SECURITY_2C", label: "Security Licence — Investigator", short: "Investigator", security: true, expires: true },
  { key: "FIRST_AID", label: "First Aid Certificate (HLTAID011)", short: "First Aid", security: false, expires: true },
  { key: "CPR", label: "CPR Certificate (HLTAID009)", short: "CPR", security: false, expires: true },
  { key: "RSA", label: "Responsible Service of Alcohol", short: "RSA", security: false, expires: true },
  { key: "WWCC", label: "Working With Children Check", short: "WWCC", security: false, expires: true },
  { key: "POLICE_CHECK", label: "National Police Check", short: "Police Check", security: false, expires: true },
  { key: "WHITE_CARD", label: "White Card (Construction Induction)", short: "White Card", security: false, expires: false },
  { key: "DRIVERS", label: "Driver's Licence", short: "Driver's", security: false, expires: true },
  { key: "FIREARMS", label: "Firearms Licence", short: "Firearms", security: false, expires: true },
  { key: "SITE_INDUCTION", label: "Site-specific Induction", short: "Site Induction", security: false, expires: false },
];

const TYPE_BY_KEY = new Map(LICENCE_TYPES.map((t) => [t.key, t]));

export function licenceType(key: string): LicenceTypeDef {
  return TYPE_BY_KEY.get(key) ?? { key, label: key, short: key, security: false, expires: true };
}

export const STATES = ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"] as const;
export type StateCode = (typeof STATES)[number];

export type LicenceStatus =
  | "VALID"
  | "EXPIRING" // 15–60 days left
  | "URGENT" // 14 days or fewer
  | "EXPIRED"
  | "UNVERIFIED"
  | "REJECTED";

export const STATUS_LABEL: Record<LicenceStatus, string> = {
  VALID: "Valid",
  EXPIRING: "Expiring soon",
  URGENT: "Urgent",
  EXPIRED: "Expired",
  UNVERIFIED: "Awaiting verification",
  REJECTED: "Rejected",
};

export const EXPIRING_DAYS = 60;
export const URGENT_DAYS = 14;

export interface LicenceLike {
  type: string;
  expiryDate: Date | string | null;
  verification: string;
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? null : x;
}

/**
 * Whole days from `now` until the licence lapses. A licence is good through
 * the end of its expiry date, so "expires today" is 0, not -1. Compared on
 * UTC calendar days because expiry dates are stored as date-only values.
 */
export function daysUntilExpiry(expiry: Date | string | null, now: Date = new Date()): number | null {
  const e = toDate(expiry);
  if (!e) return null;
  const a = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / DAY_MS);
}

export function licenceStatus(l: LicenceLike, now: Date = new Date()): LicenceStatus {
  if (l.verification === "REJECTED") return "REJECTED";
  const days = daysUntilExpiry(l.expiryDate, now);
  if (days !== null && days < 0) return "EXPIRED";
  if (l.verification !== "VERIFIED") return "UNVERIFIED";
  if (days === null) return "VALID";
  if (days <= URGENT_DAYS) return "URGENT";
  if (days <= EXPIRING_DAYS) return "EXPIRING";
  return "VALID";
}

/** Counts as "the guard may work on this" — verified and not lapsed. */
export function isCurrent(l: LicenceLike, at: Date = new Date()): boolean {
  const s = licenceStatus(l, at);
  return s === "VALID" || s === "EXPIRING" || s === "URGENT";
}

// ---------------------------------------------------------------------------
// Rostering check
// ---------------------------------------------------------------------------

export interface ComplianceIssue {
  severity: "block" | "warn";
  message: string;
}

export interface ComplianceResult {
  level: "ok" | "warn" | "block";
  issues: ComplianceIssue[];
}

/**
 * Can this guard be rostered on a shift that starts at `shiftStart`?
 *
 *  block — no security licence that is verified and still current on the day
 *  warn  — they can work, but something needs attention (renewal due, a
 *          supporting certificate has lapsed, an upload is still unverified)
 */
export function guardCompliance(
  licences: LicenceLike[],
  shiftStart: Date = new Date(),
): ComplianceResult {
  const issues: ComplianceIssue[] = [];
  const security = licences.filter((l) => licenceType(l.type).security);

  if (security.length === 0) {
    issues.push({ severity: "block", message: "No security licence on file" });
  } else if (!security.some((l) => isCurrent(l, shiftStart))) {
    // Explain the most useful reason rather than listing every dead licence.
    const anyUnverified = security.some((l) => licenceStatus(l, shiftStart) === "UNVERIFIED");
    const anyRejected = security.some((l) => l.verification === "REJECTED");
    if (anyUnverified) {
      issues.push({ severity: "block", message: "Security licence has not been verified" });
    } else if (anyRejected && security.every((l) => l.verification === "REJECTED")) {
      issues.push({ severity: "block", message: "Security licence was rejected at verification" });
    } else {
      issues.push({ severity: "block", message: "Security licence is expired on the shift date" });
    }
  } else {
    // Renewal warning is about today, not the shift date: it tells the
    // roster manager how long they have to chase the guard.
    const today = new Date();
    const best = Math.max(
      ...security
        .filter((l) => isCurrent(l, shiftStart))
        .map((l) => daysUntilExpiry(l.expiryDate, today) ?? Infinity),
    );
    if (Number.isFinite(best) && best >= 0 && best <= URGENT_DAYS) {
      issues.push({ severity: "warn", message: `Security licence expires in ${best} day${best === 1 ? "" : "s"}` });
    }
  }

  for (const l of licences) {
    const def = licenceType(l.type);
    if (def.security) continue;
    const s = licenceStatus(l, shiftStart);
    if (s === "EXPIRED") issues.push({ severity: "warn", message: `${def.short} is expired on the shift date` });
    else if (s === "UNVERIFIED") issues.push({ severity: "warn", message: `${def.short} is awaiting verification` });
  }

  const level = issues.some((i) => i.severity === "block") ? "block" : issues.length ? "warn" : "ok";
  return { level, issues };
}

// ---------------------------------------------------------------------------
// Expiry reminders
// ---------------------------------------------------------------------------

/** Days-before-expiry at which the guard is reminded. -7 is the "lapsed" chase. */
export const ALERT_THRESHOLDS = [60, 30, 14, 7, 0, -7] as const;

/**
 * Which reminder (if any) is due now. Returns the tightest threshold the
 * licence has crossed that hasn't been sent yet, so a licence added with 10
 * days left gets one "14 day" reminder rather than the 60, 30 and 14 day ones
 * back to back.
 */
export function dueAlertThreshold(daysLeft: number | null, lastAlertDays: number | null): number | null {
  if (daysLeft === null) return null;
  let due: number | null = null;
  for (const t of ALERT_THRESHOLDS) {
    if (daysLeft <= t) due = t;
  }
  if (due === null) return null;
  if (lastAlertDays !== null && lastAlertDays <= due) return null;
  return due;
}

/**
 * Reminder text. Worded from the days actually left rather than the
 * threshold that triggered it, so a licence first noticed three days after
 * it lapsed says "expired", not "expires today".
 */
export function alertMessage(firstName: string, type: string, expiry: Date, daysLeft: number, appUrl: string): string {
  const def = licenceType(type);
  const name = def.security ? `security licence (${def.short})` : def.short;
  const date = expiry.toISOString().slice(0, 10).split("-").reverse().join("/");
  const where = appUrl ? ` Upload your renewal: ${appUrl}/m/licences` : " Send your renewal to the office.";
  if (daysLeft < 0) {
    const consequence = def.security ? " You can't be rostered until it is renewed." : "";
    return `Hi ${firstName}, your ${name} expired on ${date} and we have no renewal on file.${consequence}${where}`;
  }
  if (daysLeft === 0) return `Hi ${firstName}, your ${name} expires today (${date}).${where}`;
  const consequence = def.security ? " Renew it to stay eligible for shifts." : "";
  return `Hi ${firstName}, your ${name} expires on ${date}.${consequence}${where}`;
}

// ---------------------------------------------------------------------------
// Public registers
// ---------------------------------------------------------------------------

export interface RegisterInfo {
  state: StateCode;
  regulator: string;
  /** Where an operator can look the licence up. Null when we don't know of an online register. */
  lookupUrl: string | null;
  /** Shape a security licence number normally takes in this state. */
  format: RegExp | null;
  formatHint: string | null;
}

// Only register links we could confirm are listed. For the rest the operator
// is told which regulator to contact rather than being sent to a guessed URL.
export const REGISTERS: Record<StateCode, RegisterInfo> = {
  NSW: {
    state: "NSW",
    regulator: "NSW Police — Security Licensing & Enforcement Directorate",
    lookupUrl: "https://verify.licence.nsw.gov.au/home/Security",
    format: /^\d{9}$/,
    formatHint: "9 digits",
  },
  QLD: {
    state: "QLD",
    regulator: "Queensland Office of Fair Trading",
    lookupUrl:
      "https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/security-industry-regulation/check-a-security-licence",
    format: /^\d{6,8}$/,
    formatHint: "6–8 digits",
  },
  VIC: {
    state: "VIC",
    regulator: "Victoria Police — Licensing & Regulation Division",
    lookupUrl: null,
    format: /^\d{3}-?\d{3}-?\d{2}[A-Z]$/i,
    formatHint: "###-###-##S",
  },
  SA: { state: "SA", regulator: "Consumer and Business Services (SA)", lookupUrl: null, format: null, formatHint: null },
  WA: { state: "WA", regulator: "WA Police — Licensing Services (Security)", lookupUrl: null, format: null, formatHint: null },
  TAS: { state: "TAS", regulator: "Consumer, Building and Occupational Services (TAS)", lookupUrl: null, format: null, formatHint: null },
  ACT: { state: "ACT", regulator: "Access Canberra", lookupUrl: null, format: null, formatHint: null },
  NT: { state: "NT", regulator: "Licensing NT", lookupUrl: null, format: null, formatHint: null },
};

export function registerFor(state: string): RegisterInfo {
  return REGISTERS[(state as StateCode)] ?? REGISTERS.VIC;
}

export interface PreCheck {
  label: string;
  pass: boolean;
  detail: string;
}

/**
 * The checks we can run ourselves before anyone looks at a register: is the
 * number plausible for the state, is it in date, is it attached to more than
 * one guard.
 */
export function preChecks(
  l: { type: string; number: string; state: string; expiryDate: Date | string | null },
  duplicateHolder: string | null,
  now: Date = new Date(),
): PreCheck[] {
  const out: PreCheck[] = [];
  const def = licenceType(l.type);
  const number = l.number.trim();

  if (def.security) {
    const reg = registerFor(l.state);
    if (reg.format) {
      const ok = reg.format.test(number);
      out.push({
        label: "Number format",
        pass: ok,
        detail: ok ? `Matches the usual ${reg.state} format (${reg.formatHint})` : `${reg.state} licence numbers are normally ${reg.formatHint}`,
      });
    }
  }

  const days = daysUntilExpiry(l.expiryDate, now);
  if (days === null) {
    out.push({
      label: "Expiry date",
      pass: !def.expires,
      detail: def.expires ? "No expiry date recorded" : "This credential does not expire",
    });
  } else {
    out.push({
      label: "Expiry date",
      pass: days >= 0,
      detail: days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "Expires today" : `${days} days remaining`,
    });
  }

  out.push({
    label: "Unique holder",
    pass: !duplicateHolder,
    detail: duplicateHolder ? `Same number is recorded against ${duplicateHolder}` : "Not recorded against another guard",
  });

  return out;
}

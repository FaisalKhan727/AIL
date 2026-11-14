// Shared vocabulary and rules for the operations modules (alarms, incidents,
// patrols, invoicing, training, billing). Pure: no database, no network.

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ALARM_TYPES = [
  "Motion Detection",
  "Door/Window Breach",
  "Duress/Panic Button",
  "Glass Break",
  "Perimeter Breach",
  "Access Denied ×3",
  "Tailgating Detection",
  "Tamper Alert",
  "CCTV Offline",
  "Fire Alarm",
  "Hold-Up Alarm",
  "Lone Worker Alert",
  "Vehicle Intrusion",
  "Lift/Elevator Fault",
  "Power Failure",
  "Flood/Water Detection",
  "Temperature Alert",
] as const;

/** Minutes from trigger to a guard on scene before the response SLA is breached. */
export const RESPONSE_TARGET_MINS: Record<Priority, number> = { CRITICAL: 5, HIGH: 8, MEDIUM: 15, LOW: 30 };

const DEFAULT_SOP = [
  "Verify the alarm (CCTV or call the site contact)",
  "Dispatch the nearest available guard",
  "Notify the shift supervisor",
  "Escalate to emergency services if the threat is confirmed",
  "Record every action taken on this alarm",
];

const SOPS: Record<string, string[]> = {
  "Duress/Panic Button": [
    "Confirm via CCTV. Do NOT call the site directly",
    "Dispatch the nearest guard immediately",
    "Notify the shift supervisor",
    "Contact police if there is no response within 5 minutes",
    "Keep the line clear for the responding guard",
    "Record every action taken on this alarm",
  ],
  "Hold-Up Alarm": [
    "Do NOT call the site. Treat as a live hold-up",
    "Contact police (000) and give site, zone and access details",
    "Hold guards at a safe distance until police direct otherwise",
    "Notify the client's emergency contact and company management",
    "Preserve CCTV footage",
    "Record every action taken on this alarm",
  ],
  "Fire Alarm": [
    "Confirm with the fire panel or on-site guard",
    "Contact the fire brigade (000) if confirmed or unverifiable",
    "Direct on-site guards to start evacuation and meet the brigade",
    "Notify the client's emergency contact",
    "Record every action taken on this alarm",
  ],
  "Lone Worker Alert": [
    "Call the guard on their mobile, then radio",
    "If no answer within 2 minutes, dispatch the nearest guard to their last known position",
    "Notify the shift supervisor",
    "Call an ambulance (000) if the guard is found injured or cannot be located",
    "Record every action taken on this alarm",
  ],
  "CCTV Offline": [
    "Check whether other cameras at the site are still online",
    "Ask the on-site guard to inspect the camera and cabling for tampering",
    "Log a fault with the client's CCTV maintainer",
    "Increase patrol frequency in the affected zone until restored",
  ],
};

export function sopFor(type: string): string[] {
  return SOPS[type] ?? DEFAULT_SOP;
}

export type SlaState = "ok" | "warning" | "breached";

/**
 * Where an alarm stands against its response target. The clock runs from
 * trigger until a guard is on scene (or, failing that, until it is resolved).
 */
export function responseSla(
  a: { priority: string; triggeredAt: Date | string; onSceneAt?: Date | string | null; resolvedAt?: Date | string | null },
  now: Date = new Date(),
): { state: SlaState; elapsedMs: number; targetMs: number } {
  const target = (RESPONSE_TARGET_MINS[a.priority as Priority] ?? 15) * 60_000;
  const end = a.onSceneAt ?? a.resolvedAt ?? now;
  const elapsed = Math.max(0, new Date(end).getTime() - new Date(a.triggeredAt).getTime());
  const state: SlaState = elapsed > target ? "breached" : elapsed > target * 0.7 ? "warning" : "ok";
  return { state, elapsedMs: elapsed, targetMs: target };
}

export const INCIDENT_TYPES = [
  "Theft",
  "Trespassing",
  "Vandalism",
  "Physical Altercation",
  "Medical Emergency",
  "Intoxicated Person",
  "Suspicious Activity",
  "Suspicious Package",
  "Access Violation",
  "Property Damage",
  "Vehicle Incident",
  "Fire/Safety",
  "Workplace Injury",
  "Equipment Fault",
  "Graffiti",
  "Public Disturbance",
  "Other",
] as const;

export const INCIDENT_STATUSES = ["OPEN", "UNDER_REVIEW", "ESCALATED", "RESOLVED", "ARCHIVED"] as const;

export const COURSE_CATEGORIES = [
  "Induction & Onboarding",
  "Legislation & Legal Powers",
  "Tactical Communication",
  "Emergency Response Procedures",
  "First Aid & Medical Response",
  "Fire Warden Training",
  "Customer Service & Conflict Management",
  "Site-Specific Induction",
  "Vehicle & Patrol Operations",
  "Vigilo Platform Training",
  "Leadership & Supervision",
  "Armed Guard Training",
] as const;

export const EQUIPMENT_KINDS = ["Radio", "Body-worn camera", "Torch", "NFC scanner", "Taser", "PPE", "Keys", "Other"] as const;

export const VEHICLE_CHECK_ITEMS = [
  "Exterior condition",
  "Tyres",
  "Lights and indicators",
  "Interior clean",
  "First aid kit present",
  "Fire extinguisher present",
  "Radio / device charged",
] as const;

// ---------------------------------------------------------------------------
// Patrol jobs and invoicing
// ---------------------------------------------------------------------------

export function patrolCompletion(scanned: number, stopCount: number): number {
  if (stopCount <= 0) return 0;
  return Math.min(1, scanned / stopCount);
}

/** Final status when a guard closes a job. */
export function closedJobStatus(scanned: number, stopCount: number): "COMPLETED" | "PARTIAL" | "MISSED" {
  if (scanned >= stopCount && stopCount > 0) return "COMPLETED";
  return scanned > 0 ? "PARTIAL" : "MISSED";
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What a patrol job is worth to the client: the full rate when every stop was
 * attended, a pro-rata share for a partial run, nothing for a missed one.
 */
export function jobBillable(job: { status: string; rate: number; stopCount: number; scanned: number }): number {
  if (job.status === "COMPLETED") return cents(job.rate);
  if (job.status === "PARTIAL") return cents(job.rate * patrolCompletion(job.scanned, job.stopCount));
  return 0;
}

export function invoiceTotals(lines: { quantity: number; unitPrice: number }[], gstRate: number) {
  const subtotal = cents(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const gst = cents((subtotal * gstRate) / 100);
  return { subtotal, gst, total: cents(subtotal + gst) };
}

/** SENT invoices past their due date read as OVERDUE; nothing is stored. */
export function invoiceDisplayStatus(inv: { status: string; dueAt: Date | string | null }, now: Date = new Date()): string {
  if (inv.status === "SENT" && inv.dueAt && new Date(inv.dueAt).getTime() < now.getTime()) return "OVERDUE";
  return inv.status;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

export function parseQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is QuizQuestion =>
      x && typeof x.q === "string" && Array.isArray(x.options) && x.options.length >= 2 && Number.isInteger(x.answer),
  );
}

/** Percentage score, 0–100. A course with no questions is passed by reading it. */
export function scoreQuiz(questions: QuizQuestion[], answers: number[]): number {
  if (questions.length === 0) return 100;
  const right = questions.filter((q, i) => answers[i] === q.answer).length;
  return Math.round((right / questions.length) * 100);
}

// ---------------------------------------------------------------------------
// Subscription plans
// ---------------------------------------------------------------------------

export interface Plan {
  key: string;
  name: string;
  price: string;
  guards: number | null; // null = unlimited
  sites: number | null;
  subcontractors: number | null;
  features: string[];
}

export const PLANS: Plan[] = [
  { key: "STARTER", name: "Starter", price: "$49–99 / month", guards: 15, sites: 1, subcontractors: 0, features: ["Rostering & SMS confirmations", "Timesheets", "Licence compliance", "Guard app"] },
  { key: "PROFESSIONAL", name: "Professional", price: "$199–399 / month", guards: 100, sites: 10, subcontractors: 3, features: ["Everything in Starter", "Alarm dispatch & incidents", "Patrol runs & client invoicing", "Training", "Subcontractors"] },
  { key: "ENTERPRISE", name: "Enterprise", price: "$799–1,499 / month", guards: null, sites: null, subcontractors: null, features: ["Everything in Professional", "Unlimited guards and sites", "Priority support"] },
];

export function planFor(key: string): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS[1];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function money(n: number | string | null | undefined): string {
  return `$${Number(n ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "4m 32s" / "1h 05m" */
export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}h ${pad(m)}m` : `${m}m ${pad(s % 60)}s`;
}

export function refLabel(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Infer the AlarmJob.alarmType enum value from a zone-description string.
 *
 * Returns one of: BURGLARY | FIRE | MEDICAL | PANIC | TAMPER | DURESS | OTHER.
 * Always returns a value (OTHER if nothing matches). Match is case-insensitive.
 *
 * Admin can override the inferred type in the New Alarm preview panel;
 * this is a sensible default, not a binding decision.
 */

export type AlarmType =
  | "BURGLARY"
  | "FIRE"
  | "MEDICAL"
  | "PANIC"
  | "TAMPER"
  | "DURESS"
  | "OTHER";

// Order matters — more specific keywords (e.g. "duress" overlapping with
// "panic" or "fire" overlapping with "smoke") should appear first.
// Each rule is { type, keywords } where keywords are matched as whole-words
// (with the regex \b boundary) case-insensitively.
const RULES: Array<{ type: AlarmType; keywords: string[] }> = [
  { type: "DURESS", keywords: ["duress"] },
  { type: "PANIC", keywords: ["panic", "hold-up", "holdup", "hold up"] },
  { type: "MEDICAL", keywords: ["medical", "ambulance"] },
  { type: "TAMPER", keywords: ["tamper"] },
  {
    type: "FIRE",
    keywords: ["smoke", "fire", "heat detector", "heat sensor"],
  },
  {
    type: "BURGLARY",
    keywords: [
      "pir",
      "motion",
      "movement",
      "door",
      "entry",
      "contact",
      "glass break",
      "glassbreak",
      "intrusion",
      "burglary",
    ],
  },
];

export function inferAlarmType(zoneText: string | null | undefined): AlarmType {
  if (!zoneText) return "OTHER";
  const text = zoneText.toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      // Word-boundary match. The PIR rule uses /\bpir\b/ which intentionally
      // matches "Pir" in "Front Entry Pir" but not "spirit".
      const rx = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`);
      if (rx.test(text)) return rule.type;
    }
  }
  return "OTHER";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

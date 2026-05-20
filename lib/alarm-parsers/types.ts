/**
 * Paste-and-parse alarm intake — parser interface.
 *
 * Each monitoring centre's message format lives in its own file under
 * lib/alarm-parsers/. The registry (index.ts) tries each registered
 * parser's detect() in order and picks the highest-confidence match.
 *
 * Adding a new format = new file + register in index.ts. No changes to
 * the intake UI or to the parser interface itself.
 */

export type MatchConfidence = "MATCH_HIGH" | "MATCH_LOW" | "NO_MATCH";

/**
 * Fields a parser can extract from a raw pasted message. All optional —
 * a parser may extract only what it found. The intake UI shows whatever
 * was extracted with every field editable; admin can fill gaps manually.
 */
export interface ParsedAlarmFields {
  source?: string;
  sourceReference?: string;
  /** Parsed timestamp from the message, interpreted in Australia/Melbourne. */
  receivedAt?: Date;
  bureau?: string;
  areaLabel?: string;
  zoneLabel?: string;
  siteName?: string;
  siteAddress?: string;
  /** Inferred from zoneLabel keywords. Admin can override in the preview. */
  alarmType?: string;
}

export interface AlarmParser {
  /** Stable identifier stored on AlarmJob.parserUsed when this parser handled the intake. */
  name: string;
  /** Quick check: does this look like a message in our format? */
  detect(text: string): MatchConfidence;
  /** Pull fields out. Should never throw — return empty fields on bad input. */
  parse(text: string): ParsedAlarmFields;
}

/**
 * Output of the registry's detectAndParse(). Carries the raw text through
 * so the intake handler can persist it on AlarmJob.rawIntakeText for audit.
 */
export interface DetectAndParseResult {
  /** Parser name that handled it: "guardian", "manual", etc. */
  parser: string;
  /** Persisted on AlarmJob.parseConfidence. */
  confidence: "high" | "low" | "manual";
  fields: ParsedAlarmFields;
  rawText: string;
}

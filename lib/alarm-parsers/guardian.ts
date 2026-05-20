import { fromZonedTime } from "date-fns-tz";
import type { AlarmParser, MatchConfidence, ParsedAlarmFields } from "./types";
import { inferAlarmType } from "./type-inference";

/**
 * Guardian Security Group monitoring-centre format parser.
 *
 * Sample input:
 *
 *   From: Guardian Security Group
 *   2026-05-17 17:00:54
 *   Bureau: Secura Protective Solutions
 *   Area: 1 MJB Cont - Access
 *   Zone: 2 Front Entry Pir in Factory
 *   Address:
 *   MJB Contractors - Access Way
 *   41B Access Way
 *   Carrum Downs, Victoria, 3201
 *   Job number 180001
 *
 * Forgiving on whitespace, label casing, and the "Job number" / "Job
 * number:" punctuation variants.
 */

const RX_FROM = /^\s*from\s*:\s*(.+?)\s*$/im;
const RX_BUREAU = /^\s*bureau\s*:\s*(.+?)\s*$/im;
const RX_AREA = /^\s*area\s*:\s*(.+?)\s*$/im;
const RX_ZONE = /^\s*zone\s*:\s*(.+?)\s*$/im;
const RX_DATETIME = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const RX_JOB_NUMBER = /\bjob\s*number\s*:?\s*(\d+)\b/i;
const RX_ADDRESS_LABEL = /^\s*address\s*:\s*$/im;
// Lines that mark the END of the address block when scanning forward.
const RX_NEXT_LABEL = /^\s*(?:from|bureau|area|zone|job\s*number|reference|priority|case|incident)\s*:?/i;

/**
 * Detect: counts how many distinctive Guardian markers are present.
 * 5+ → MATCH_HIGH; 3-4 → MATCH_LOW; else NO_MATCH.
 */
function detect(text: string): MatchConfidence {
  let score = 0;
  if (/from\s*:\s*guardian/i.test(text)) score += 1;
  if (RX_BUREAU.test(text)) score += 1;
  if (RX_AREA.test(text)) score += 1;
  if (RX_ZONE.test(text)) score += 1;
  if (RX_DATETIME.test(text)) score += 1;
  if (RX_JOB_NUMBER.test(text)) score += 1;
  if (score >= 5) return "MATCH_HIGH";
  if (score >= 3) return "MATCH_LOW";
  return "NO_MATCH";
}

function extractAddressBlock(
  text: string,
): { siteName?: string; siteAddress?: string } {
  // Normalise line endings; split.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const startIdx = lines.findIndex((l) => /^\s*address\s*:\s*$/i.test(l));
  if (startIdx === -1) return {};

  const collected: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      if (collected.length > 0) break; // blank line after content ends the block
      continue;
    }
    if (RX_NEXT_LABEL.test(trimmed)) break;
    collected.push(trimmed);
  }
  if (collected.length === 0) return {};
  const siteName = collected[0];
  const siteAddress = collected.slice(1).join(", ") || undefined;
  return { siteName, siteAddress };
}

function parseGuardianDate(text: string): Date | undefined {
  const m = RX_DATETIME.exec(text);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  // Construct as Australia/Melbourne local time, return UTC Date.
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  try {
    return fromZonedTime(iso, "Australia/Melbourne");
  } catch {
    return undefined;
  }
}

function parse(text: string): ParsedAlarmFields {
  const fields: ParsedAlarmFields = {};

  const from = RX_FROM.exec(text);
  if (from) fields.source = from[1].trim();

  const bureau = RX_BUREAU.exec(text);
  if (bureau) fields.bureau = bureau[1].trim();

  const area = RX_AREA.exec(text);
  if (area) fields.areaLabel = area[1].trim();

  const zone = RX_ZONE.exec(text);
  if (zone) {
    fields.zoneLabel = zone[1].trim();
    fields.alarmType = inferAlarmType(fields.zoneLabel);
  }

  const job = RX_JOB_NUMBER.exec(text);
  if (job) fields.sourceReference = job[1];

  const receivedAt = parseGuardianDate(text);
  if (receivedAt) fields.receivedAt = receivedAt;

  const { siteName, siteAddress } = extractAddressBlock(text);
  if (siteName) fields.siteName = siteName;
  if (siteAddress) fields.siteAddress = siteAddress;

  // If zone wasn't found, fall back to "OTHER" so the field is populated.
  if (!fields.alarmType) fields.alarmType = "OTHER";

  return fields;
}

export const guardianParser: AlarmParser = {
  name: "guardian",
  detect,
  parse,
};

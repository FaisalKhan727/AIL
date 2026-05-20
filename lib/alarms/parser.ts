/**
 * Inbound SMS parser for alarm responder replies.
 *
 * Pure function — no DB, no timezone math. The caller is responsible for
 * combining the parsed HH:MM strings with the alarm's receivedAt date and
 * applying the "next day if onsite < dispatch" heuristic.
 *
 * Returned `result` text is the responder's free-form note (e.g. "All good
 * and secure", "False alarm", "Found broken window") — everything in the
 * message that isn't a time or a recognised keyword.
 */

export type AlarmReply =
  | {
      kind: "complete";
      /** HH:MM in 24-hour format, e.g. "11:47", "00:13". */
      onsiteHHmm: string;
      /** HH:MM in 24-hour format. May be earlier than onsiteHHmm if shift crossed midnight; caller decides. */
      offsiteHHmm: string;
      /** Free-form result note (trimmed, max 500 chars). May be empty if not provided. */
      resultText: string;
    }
  | { kind: "acknowledged" }
  | { kind: "declined" }
  | { kind: "unparsed"; reason: string };

const ONSITE_KEYWORDS = ["ON\\s*SITE", "ARRIVED"];
const OFFSITE_KEYWORDS = ["OFF\\s*SITE", "DEPARTED", "LEFT"];

// Time accepts: 1147, 11:47, 11.47, 11:47PM, 11:47 PM, 1147 AM
const TIME_RX = /(\d{1,2})\s*[:.]?\s*(\d{2})\s*([AP]M)?/i;

const ACK_PATTERNS = [
  /^ok\b/i,
  /^okay\b/i,
  /^yes\b/i,
  /^yep\b/i,
  /^yeah\b/i,
  /^on\s+(?:my|the)\s+way\b/i,
  /^omw\b/i,
  /^got\s+it\b/i,
  /^received\b/i,
  /^acknowledged\b/i,
  /^ack\b/i,
];

const DECLINE_PATTERNS = [
  /^no\b/i,
  /^nope\b/i,
  /^can[''`]?t\b/i,
  /^cannot\b/i,
  /^unavailable\b/i,
  /^not\s+available\b/i,
  /^busy\b/i,
  /^sorry\b/i,
  /^pass\b/i,
];

/**
 * Try to extract `HH:MM` (24h) from a captured time match.
 * Returns null if the parsed time is implausible.
 */
function normaliseTime(rawHour: string, rawMin: string, ampm: string | undefined): string | null {
  let h = Number.parseInt(rawHour, 10);
  const m = Number.parseInt(rawMin, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (m < 0 || m > 59) return null;

  if (ampm) {
    const isPm = ampm.toUpperCase().startsWith("P");
    if (h < 1 || h > 12) return null;
    if (isPm && h !== 12) h += 12;
    else if (!isPm && h === 12) h = 0;
  } else {
    if (h < 0 || h > 23) return null;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildTimeRx(keywords: string[]): RegExp {
  // (?:ON SITE|ARRIVED)\s+<time>
  return new RegExp(
    `(?:${keywords.join("|")})\\s*[:\\-]?\\s*(\\d{1,2})\\s*[:.]?\\s*(\\d{2})\\s*([AP]M)?`,
    "i",
  );
}

const ONSITE_RX = buildTimeRx(ONSITE_KEYWORDS);
const OFFSITE_RX = buildTimeRx(OFFSITE_KEYWORDS);

/**
 * Loose-format fallback: "1147 to 1213, all clear" pattern. Two times
 * separated by "to" / "-" / "until" with no explicit ONSITE/OFFSITE keywords.
 */
const LOOSE_RANGE_RX =
  /\b(\d{1,2}[:.]?\d{2})\s*(?:[AP]M)?\s*(?:to|-|until|–|—)\s*(\d{1,2}[:.]?\d{2})\s*(?:[AP]M)?/i;

function extractResultText(body: string): string {
  // Strip ONSITE/OFFSITE keywords and their times, then trim.
  // Keep everything else as the result note.
  let cleaned = body
    .replace(ONSITE_RX, " ")
    .replace(OFFSITE_RX, " ")
    .replace(LOOSE_RANGE_RX, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Strip leading punctuation / connectors
  cleaned = cleaned.replace(/^[,;:.\-–—\s]+/, "");
  return cleaned.slice(0, 500);
}

export function parseAlarmReply(body: string): AlarmReply {
  const text = (body ?? "").trim();
  if (!text) return { kind: "unparsed", reason: "empty body" };

  // 1. Try the structured pattern first: ONSITE <time> ... OFFSITE <time> ...
  const onsiteMatch = ONSITE_RX.exec(text);
  const offsiteMatch = OFFSITE_RX.exec(text);
  if (onsiteMatch && offsiteMatch) {
    const onsite = normaliseTime(onsiteMatch[1], onsiteMatch[2], onsiteMatch[3]);
    const offsite = normaliseTime(offsiteMatch[1], offsiteMatch[2], offsiteMatch[3]);
    if (onsite && offsite) {
      return {
        kind: "complete",
        onsiteHHmm: onsite,
        offsiteHHmm: offsite,
        resultText: extractResultText(text),
      };
    }
  }

  // 2. Loose range: "1147 to 1213 all clear"
  const loose = LOOSE_RANGE_RX.exec(text);
  if (loose) {
    const onMatch = TIME_RX.exec(loose[1]);
    const offMatch = TIME_RX.exec(loose[2]);
    if (onMatch && offMatch) {
      const onsite = normaliseTime(onMatch[1], onMatch[2], onMatch[3]);
      const offsite = normaliseTime(offMatch[1], offMatch[2], offMatch[3]);
      if (onsite && offsite) {
        return {
          kind: "complete",
          onsiteHHmm: onsite,
          offsiteHHmm: offsite,
          resultText: extractResultText(text),
        };
      }
    }
  }

  // 3. Pure decline (check before ack — "no" is more specific)
  if (DECLINE_PATTERNS.some((rx) => rx.test(text))) {
    return { kind: "declined" };
  }

  // 4. Pure ack (no times, just affirmative)
  if (ACK_PATTERNS.some((rx) => rx.test(text))) {
    return { kind: "acknowledged" };
  }

  return { kind: "unparsed", reason: "no times or known keywords found" };
}

/**
 * Combine a parsed HH:MM string with the alarm's dispatch date to build
 * a concrete Date, applying the "next day if reported time is earlier
 * than dispatch" heuristic.
 *
 * Pass the timezone (e.g. "Australia/Melbourne") so the parsed local
 * time is anchored correctly. For simplicity we treat dispatchedAt as
 * the local time reference: if the parsed time is earlier than
 * dispatchedAt's local time, advance one calendar day.
 */
export function combineHHmmWithDispatch(
  hhmm: string,
  dispatchedAt: Date,
  // timezone reserved for future TZ-aware math; current impl uses local-date heuristic
): Date {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`bad HH:mm "${hhmm}"`);
  }
  // Anchor to dispatchedAt's local date (in the server's TZ since alarms
  // run in a single business region; production deploys set TZ env to AU).
  const local = new Date(dispatchedAt);
  local.setHours(h, m, 0, 0);
  if (local.getTime() < dispatchedAt.getTime()) {
    local.setDate(local.getDate() + 1);
  }
  return local;
}

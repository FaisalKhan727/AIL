// Inbound SMS reply parser.
//
// Inputs:
//   body              — the raw SMS body the guard sent
//   pendingShifts     — guard's currently pending/active shifts in display order,
//                       each with a 1-based `index` (matching the outbound list)
//                       and a `confirmCode` (e.g. "K7Q9")
//
// Output: a normalised list of decisions OR an "unparsed" status.

export type Decision = "YES" | "NO";

export interface ParserShift {
  shiftId: string;
  index: number;       // 1-based, as shown in the outbound message
  confirmCode: string; // unique short code
}

export interface ParsedDecision {
  shiftId: string;
  decision: Decision;
}

export type ParseResult =
  | { status: "ok"; decisions: ParsedDecision[] }
  | { status: "unparsed"; reason: string };

const YES_TOKENS = new Set(["YES", "Y", "YEP", "YEAH", "OK", "OKAY", "CONFIRM", "CONFIRMED"]);
const NO_TOKENS = new Set(["NO", "N", "NOPE", "REJECT", "REJECTED", "DECLINE", "DECLINED", "CANT", "CANNOT"]);

function normalise(body: string): string {
  return body
    .toUpperCase()
    .replace(/[‘’“”]/g, "")
    .trim();
}

function decisionFor(token: string): Decision | null {
  if (YES_TOKENS.has(token)) return "YES";
  if (NO_TOKENS.has(token)) return "NO";
  return null;
}

/** "ALL YES" / "YES ALL" / "Y ALL" / "ALL Y" etc. */
function matchAll(text: string): Decision | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  const tokens = compact.split(/\s+/);
  if (tokens.length !== 2) return null;
  const [a, b] = tokens;
  if (a === "ALL") {
    const d = decisionFor(b);
    if (d) return d;
  }
  if (b === "ALL") {
    const d = decisionFor(a);
    if (d) return d;
  }
  return null;
}

/**
 * Pull out (number, decision) pairs in any order:
 *   "1 YES, 2 NO, 3 YES"
 *   "1Y 2N 3Y"
 *   "1=yes, 2=no"
 *   "yes 1 no 2"
 * Returns null if nothing pair-shaped is found.
 */
function matchNumberedPairs(text: string): { index: number; decision: Decision }[] | null {
  const pairs: { index: number; decision: Decision }[] = [];

  // Pattern A: number then decision token (with optional separators).
  //   "1 yes", "1=Y", "1: NO", "1-yes"
  const re1 = /(\d{1,3})\s*[:=\-.\s]?\s*([A-Z]+)/g;
  for (const m of text.matchAll(re1)) {
    const idx = parseInt(m[1], 10);
    const dec = decisionFor(m[2]);
    if (dec && idx > 0) pairs.push({ index: idx, decision: dec });
  }

  // Pattern B: decision then number.  "yes 1", "no 2"
  if (pairs.length === 0) {
    const re2 = /\b([A-Z]+)\s+(\d{1,3})\b/g;
    for (const m of text.matchAll(re2)) {
      const dec = decisionFor(m[1]);
      const idx = parseInt(m[2], 10);
      if (dec && idx > 0) pairs.push({ index: idx, decision: dec });
    }
  }

  if (pairs.length === 0) return null;

  // Dedupe — last decision per index wins.
  const map = new Map<number, Decision>();
  for (const p of pairs) map.set(p.index, p.decision);
  return Array.from(map.entries()).map(([index, decision]) => ({ index, decision }));
}

/** "YES K7Q9" / "NO K7Q9 K2X4" / "K7Q9 YES" */
function matchByCode(text: string, shifts: ParserShift[]): { shiftId: string; decision: Decision }[] | null {
  const codes = new Map(shifts.map((s) => [s.confirmCode.toUpperCase(), s.shiftId]));
  const out: { shiftId: string; decision: Decision }[] = [];

  // Find all (decision, code) or (code, decision) adjacent pairs.
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const da = decisionFor(a);
    const db = decisionFor(b);
    if (da && codes.has(b)) {
      out.push({ shiftId: codes.get(b)!, decision: da });
    } else if (db && codes.has(a)) {
      out.push({ shiftId: codes.get(a)!, decision: db });
    }
  }

  if (out.length === 0) return null;

  const dedup = new Map<string, Decision>();
  for (const p of out) dedup.set(p.shiftId, p.decision);
  return Array.from(dedup.entries()).map(([shiftId, decision]) => ({ shiftId, decision }));
}

/** Bare "YES" / "NO" — only valid if guard has exactly one pending shift. */
function matchBare(text: string): Decision | null {
  const t = text.replace(/[^A-Z]+/g, "");
  return decisionFor(t);
}

export function parseInboundReply(body: string, pendingShifts: ParserShift[]): ParseResult {
  if (!body || !body.trim()) return { status: "unparsed", reason: "empty body" };
  if (pendingShifts.length === 0) return { status: "unparsed", reason: "no pending shifts" };

  const text = normalise(body);

  // 1. ALL YES / ALL NO
  const all = matchAll(text);
  if (all) {
    return {
      status: "ok",
      decisions: pendingShifts.map((s) => ({ shiftId: s.shiftId, decision: all })),
    };
  }

  // 2. Match by confirm code (if codes appear in body).
  const byCode = matchByCode(text, pendingShifts);
  if (byCode) return { status: "ok", decisions: byCode };

  // 3. Numbered pairs.
  const pairs = matchNumberedPairs(text);
  if (pairs) {
    const indexed = new Map(pendingShifts.map((s) => [s.index, s.shiftId]));
    const decisions: ParsedDecision[] = [];
    for (const p of pairs) {
      const shiftId = indexed.get(p.index);
      if (shiftId) decisions.push({ shiftId, decision: p.decision });
    }
    if (decisions.length > 0) return { status: "ok", decisions };
  }

  // 4. Bare YES/NO — apply to all pending shifts (treat as ALL YES / ALL NO).
  const bare = matchBare(text);
  if (bare) {
    return {
      status: "ok",
      decisions: pendingShifts.map((s) => ({ shiftId: s.shiftId, decision: bare })),
    };
  }

  return { status: "unparsed", reason: "no recognised pattern" };
}

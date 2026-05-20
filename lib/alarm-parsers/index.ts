/**
 * Paste-and-parse alarm intake — registry.
 *
 * Tries each registered parser's detect() in order. Returns the highest-
 * confidence match (MATCH_HIGH wins over any number of MATCH_LOWs). Falls
 * back to manual (empty fields) if nothing matches.
 *
 * Adding a new monitoring-centre format: import the parser, push into
 * PARSERS array. The intake UI doesn't change.
 */

import { guardianParser } from "./guardian";
import { manualParser } from "./manual";
import type { AlarmParser, DetectAndParseResult } from "./types";

const PARSERS: AlarmParser[] = [
  guardianParser,
  // ADT, Glory Tactical, etc. — add as samples come in
];

export function detectAndParse(text: string): DetectAndParseResult {
  let highMatch: AlarmParser | null = null;
  const lowMatches: AlarmParser[] = [];

  for (const parser of PARSERS) {
    const confidence = parser.detect(text);
    if (confidence === "MATCH_HIGH") {
      highMatch = parser;
      break; // first MATCH_HIGH wins
    }
    if (confidence === "MATCH_LOW") {
      lowMatches.push(parser);
    }
  }

  if (highMatch) {
    return {
      parser: highMatch.name,
      confidence: "high",
      fields: highMatch.parse(text),
      rawText: text,
    };
  }
  if (lowMatches.length > 0) {
    const chosen = lowMatches[0];
    return {
      parser: chosen.name,
      confidence: "low",
      fields: chosen.parse(text),
      rawText: text,
    };
  }
  // Manual fallback — empty fields, admin fills in
  return {
    parser: manualParser.name,
    confidence: "manual",
    fields: manualParser.parse(text),
    rawText: text,
  };
}

export type { AlarmParser, MatchConfidence, ParsedAlarmFields, DetectAndParseResult } from "./types";
export { guardianParser } from "./guardian";
export { manualParser } from "./manual";

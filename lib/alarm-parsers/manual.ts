import type { AlarmParser } from "./types";

/**
 * Fallback parser. Never claims a match — the registry only falls back to
 * this when no other parser matched the pasted text. Returns empty fields
 * so admin can fill the New Alarm form manually.
 */
export const manualParser: AlarmParser = {
  name: "manual",
  detect: () => "NO_MATCH",
  parse: () => ({}),
};

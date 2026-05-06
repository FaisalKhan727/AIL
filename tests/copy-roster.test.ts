import { describe, expect, it } from "vitest";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  planCopy,
  shiftDateInTz,
  calendarDayDiff,
  type SourceShift,
  type SourceGuard,
  type SourceSite,
  type CopyOptions,
} from "../lib/copy-roster";

const TZ = "Australia/Melbourne";

const DEFAULT_OPTS: CopyOptions = {
  keepGuards: true,
  keepNotes: true,
  skipInactiveGuards: true,
  skipInactiveSites: true,
};

/** Build a UTC Date from "yyyy-MM-dd HH:mm" interpreted in TZ. */
function tzWall(s: string): Date {
  // Replace "yyyy-MM-dd HH:mm" with ISO-ish "yyyy-MM-ddTHH:mm:00"
  const iso = s.replace(" ", "T") + ":00";
  return fromZonedTime(iso, TZ);
}

function fmt(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd HH:mm");
}

function makeSite(id: string, active = true): SourceSite {
  return { id, active };
}

function makeGuard(id: string, opts: Partial<SourceGuard> = {}): SourceGuard {
  return { id, active: opts.active ?? true, licenceExpiry: opts.licenceExpiry ?? null };
}

function makeShift(over: Partial<SourceShift>): SourceShift {
  // Explicit-property check so passing `guardId: null` is preserved (the helper
  // can't tell "absent" from "null" with ??).
  return {
    id: over.id ?? "s1",
    guardId: "guardId" in over ? (over.guardId ?? null) : "g1",
    siteId: over.siteId ?? "site1",
    templateId: "templateId" in over ? (over.templateId ?? null) : null,
    startAt: over.startAt ?? tzWall("2026-05-04 08:00"),
    endAt: over.endAt ?? tzWall("2026-05-04 14:00"),
    role: "role" in over ? (over.role ?? null) : "Static",
    notes: "notes" in over ? (over.notes ?? null) : "Some notes",
  };
}

describe("shiftDateInTz", () => {
  it("preserves wall-clock time when adding days within the same DST period", () => {
    const d = tzWall("2026-05-04 08:00");
    const out = shiftDateInTz(d, 7, TZ);
    expect(fmt(out)).toBe("2026-05-11 08:00");
  });

  it("preserves wall-clock time across the Australian DST end (April first Sunday)", () => {
    // Aus DST ends first Sunday of April 2026 -> 5 April. AEDT (UTC+11) -> AEST (UTC+10).
    // Source 2 April 19:00 (AEDT). Target 9 April 19:00 (AEST). Wall-clock equal,
    // but absolute time differs by exactly +1h because the clocks went back.
    const src = tzWall("2026-04-02 19:00");
    const out = shiftDateInTz(src, 7, TZ);
    expect(fmt(out)).toBe("2026-04-09 19:00");
    const elapsedMs = out.getTime() - src.getTime();
    expect(elapsedMs).toBe(7 * 86_400_000 + 60 * 60_000);
  });

  it("preserves wall-clock time across the Australian DST start (October first Sunday)", () => {
    // Aus DST starts first Sunday of October 2025 -> 5 October. AEST -> AEDT.
    const src = tzWall("2025-10-01 22:00");
    const out = shiftDateInTz(src, 7, TZ);
    expect(fmt(out)).toBe("2025-10-08 22:00");
    const elapsedMs = out.getTime() - src.getTime();
    // Clocks went forward, so the same wall-clock is one hour earlier in absolute time.
    expect(elapsedMs).toBe(7 * 86_400_000 - 60 * 60_000);
  });
});

describe("calendarDayDiff", () => {
  it("reports 7 for one week ahead at the same time-of-day", () => {
    const a = tzWall("2026-05-04 00:00");
    const b = tzWall("2026-05-11 00:00");
    expect(calendarDayDiff(a, b, TZ)).toBe(7);
  });
  it("reports 14 for two weeks ahead even when one straddles DST", () => {
    const a = tzWall("2026-03-30 00:00"); // before April 5 DST end
    const b = tzWall("2026-04-13 00:00"); // after
    expect(calendarDayDiff(a, b, TZ)).toBe(14);
  });
});

describe("planCopy", () => {
  const sites = new Map<string, SourceSite>([["site1", makeSite("site1")]]);
  const guards = new Map<string, SourceGuard>([["g1", makeGuard("g1")]]);

  it("copies a same-day shift with wall-clock times preserved 7 days later", () => {
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.planned).toHaveLength(1);
    const p = plan.planned[0];
    expect(p.sourceShiftId).toBe("s1");
    expect(fmt(p.startAt)).toBe("2026-05-11 08:00");
    expect(fmt(p.endAt)).toBe("2026-05-11 14:00");
    expect(p.guardId).toBe("g1");
    expect(p.siteId).toBe("site1");
    expect(p.notes).toBe("Some notes");
    expect(p.warnings).toEqual([]);
  });

  it("preserves the next-day endAt for a midnight-crossing shift", () => {
    const overnight = makeShift({
      id: "s_night",
      startAt: tzWall("2026-05-04 19:00"),
      endAt: tzWall("2026-05-05 08:00"),
      role: "Overnight",
    });
    const plan = planCopy({
      shifts: [overnight],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    const p = plan.planned[0];
    expect(fmt(p.startAt)).toBe("2026-05-11 19:00");
    expect(fmt(p.endAt)).toBe("2026-05-12 08:00");
  });

  it("midnight-crossing shift across DST end keeps both wall-clock times", () => {
    // Source: 2 April 19:00 (AEDT) -> 3 April 08:00 (AEDT) = 13h elapsed.
    // Target: 9 April 19:00 (AEST) -> 10 April 08:00 (AEST). Same wall clock,
    // but absolute elapsed time becomes 14h because the source spanned DST end.
    const overnight = makeShift({
      id: "s_dst",
      startAt: tzWall("2026-04-02 19:00"),
      endAt: tzWall("2026-04-03 08:00"),
    });
    const plan = planCopy({
      shifts: [overnight],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    const p = plan.planned[0];
    expect(fmt(p.startAt)).toBe("2026-04-09 19:00");
    expect(fmt(p.endAt)).toBe("2026-04-10 08:00");
  });

  it("with skipInactiveGuards on, drops shifts whose guard is now inactive", () => {
    const guardsLocal = new Map<string, SourceGuard>([
      ["g1", makeGuard("g1", { active: false })],
    ]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards: guardsLocal,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: { ...DEFAULT_OPTS, skipInactiveGuards: true },
    });
    expect(plan.planned).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toMatch(/inactive/);
  });

  it("with skipInactiveGuards off, copies the shift as unassigned with a warning", () => {
    const guardsLocal = new Map<string, SourceGuard>([
      ["g1", makeGuard("g1", { active: false })],
    ]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards: guardsLocal,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: { ...DEFAULT_OPTS, skipInactiveGuards: false },
    });
    expect(plan.planned).toHaveLength(1);
    expect(plan.planned[0].guardId).toBeNull();
    expect(plan.planned[0].warnings.join(" ")).toMatch(/inactive/);
    expect(plan.unassignedCount).toBe(1);
  });

  it("forces unassigned + warning when the guard's licence expires before the new start", () => {
    const guardsLocal = new Map<string, SourceGuard>([
      ["g1", makeGuard("g1", { licenceExpiry: tzWall("2026-05-08 00:00") })],
    ]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards: guardsLocal,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.planned).toHaveLength(1);
    expect(plan.planned[0].guardId).toBeNull();
    expect(plan.planned[0].warnings.join(" ")).toMatch(/licence/i);
  });

  it("does NOT force unassigned if the licence expires after the new start", () => {
    const guardsLocal = new Map<string, SourceGuard>([
      ["g1", makeGuard("g1", { licenceExpiry: tzWall("2026-12-31 00:00") })],
    ]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards: guardsLocal,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.planned[0].guardId).toBe("g1");
    expect(plan.planned[0].warnings).toEqual([]);
  });

  it("keepGuards=false makes every copied shift unassigned regardless of guard state", () => {
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" }), makeShift({ id: "s2", guardId: "g1" })],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: { ...DEFAULT_OPTS, keepGuards: false },
    });
    expect(plan.planned).toHaveLength(2);
    expect(plan.planned.every((p) => p.guardId === null)).toBe(true);
    expect(plan.unassignedCount).toBe(2);
  });

  it("keepNotes=false drops the notes from every copied shift", () => {
    const plan = planCopy({
      shifts: [makeShift({ id: "s1", notes: "Bring radio" })],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: { ...DEFAULT_OPTS, keepNotes: false },
    });
    expect(plan.planned[0].notes).toBeNull();
  });

  it("inactive site with skipInactiveSites=true is dropped", () => {
    const sitesLocal = new Map<string, SourceSite>([["site1", makeSite("site1", false)]]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards,
      sites: sitesLocal,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.planned).toHaveLength(0);
    expect(plan.skipped[0].reason).toMatch(/site/i);
  });

  it("inactive site with skipInactiveSites=false is copied with a warning", () => {
    const sitesLocal = new Map<string, SourceSite>([["site1", makeSite("site1", false)]]);
    const plan = planCopy({
      shifts: [makeShift({ id: "s1" })],
      guards,
      sites: sitesLocal,
      daysOffset: 7,
      timezone: TZ,
      options: { ...DEFAULT_OPTS, skipInactiveSites: false },
    });
    expect(plan.planned).toHaveLength(1);
    expect(plan.planned[0].warnings.join(" ")).toMatch(/site/i);
  });

  it("templateId is carried over so the new shift stays linked to the original template", () => {
    const plan = planCopy({
      shifts: [makeShift({ id: "s1", templateId: "tpl_morning" })],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.planned[0].templateId).toBe("tpl_morning");
  });

  it("unassigned source shift (no guardId) is copied as unassigned without warnings", () => {
    const plan = planCopy({
      shifts: [makeShift({ id: "s1", guardId: null })],
      guards,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.planned).toHaveLength(1);
    expect(plan.planned[0].guardId).toBeNull();
    expect(plan.planned[0].warnings).toEqual([]);
  });

  it("aggregates counts: planned, skipped, unassigned", () => {
    const guardsLocal = new Map<string, SourceGuard>([
      ["g1", makeGuard("g1")],
      ["g2", makeGuard("g2", { active: false })],
      ["g3", makeGuard("g3", { licenceExpiry: tzWall("2026-05-01 00:00") })],
    ]);
    const plan = planCopy({
      shifts: [
        makeShift({ id: "s1", guardId: "g1" }),
        makeShift({ id: "s2", guardId: "g2" }), // skipped (inactive guard)
        makeShift({ id: "s3", guardId: "g3" }), // forced unassigned (expired licence)
      ],
      guards: guardsLocal,
      sites,
      daysOffset: 7,
      timezone: TZ,
      options: DEFAULT_OPTS,
    });
    expect(plan.sourceShiftCount).toBe(3);
    expect(plan.plannedCount).toBe(2);
    expect(plan.skippedCount).toBe(1);
    expect(plan.unassignedCount).toBe(1);
  });
});

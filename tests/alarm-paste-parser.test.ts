import { describe, expect, it } from "vitest";
import { detectAndParse, guardianParser } from "@/lib/alarm-parsers";
import { inferAlarmType } from "@/lib/alarm-parsers/type-inference";

// The canonical sample message the spec was written against.
const CANONICAL_SAMPLE = `From: Guardian Security Group
2026-05-17 17:00:54
Bureau: Secura Protective Solutions
Area: 1 MJB Cont - Access
Zone: 2 Front Entry Pir in Factory
Address:
MJB Contractors - Access Way
41B Access Way
Carrum Downs, Victoria, 3201
Job number 180001`;

describe("guardianParser.detect", () => {
  it("returns MATCH_HIGH on the canonical sample", () => {
    expect(guardianParser.detect(CANONICAL_SAMPLE)).toBe("MATCH_HIGH");
  });

  it("returns NO_MATCH on a completely unrelated message", () => {
    expect(
      guardianParser.detect("Hi, this is not an alarm. Please call me back."),
    ).toBe("NO_MATCH");
  });

  it("returns MATCH_LOW when ~3 markers present but Guardian header missing", () => {
    const partial = `Bureau: Whoever
Area: 1 X
Zone: 2 Y
Job number 99`;
    expect(guardianParser.detect(partial)).toBe("MATCH_LOW");
  });
});

describe("guardianParser.parse — canonical sample", () => {
  const result = guardianParser.parse(CANONICAL_SAMPLE);

  it("extracts source", () => {
    expect(result.source).toBe("Guardian Security Group");
  });

  it("extracts bureau", () => {
    expect(result.bureau).toBe("Secura Protective Solutions");
  });

  it("extracts area", () => {
    expect(result.areaLabel).toBe("1 MJB Cont - Access");
  });

  it("extracts zone", () => {
    expect(result.zoneLabel).toBe("2 Front Entry Pir in Factory");
  });

  it("infers BURGLARY from 'Pir' in the zone text", () => {
    expect(result.alarmType).toBe("BURGLARY");
  });

  it("extracts siteName as first line after Address:", () => {
    expect(result.siteName).toBe("MJB Contractors - Access Way");
  });

  it("joins remaining address lines into siteAddress", () => {
    expect(result.siteAddress).toBe("41B Access Way, Carrum Downs, Victoria, 3201");
  });

  it("extracts sourceReference from 'Job number 180001'", () => {
    expect(result.sourceReference).toBe("180001");
  });

  it("parses receivedAt at Australia/Melbourne local 17:00:54", () => {
    // 2026-05-17 17:00 Melbourne = 07:00 UTC (AEST is UTC+10, no DST in May)
    expect(result.receivedAt).toBeInstanceOf(Date);
    expect(result.receivedAt?.toISOString()).toBe("2026-05-17T07:00:54.000Z");
  });
});

describe("guardianParser.parse — format variations", () => {
  it("handles \\r\\n line endings", () => {
    const crlf = CANONICAL_SAMPLE.replace(/\n/g, "\r\n");
    const r = guardianParser.parse(crlf);
    expect(r.siteName).toBe("MJB Contractors - Access Way");
    expect(r.sourceReference).toBe("180001");
  });

  it("handles extra whitespace inside labels (case-insensitive)", () => {
    const messy = `FROM:    Guardian Security Group
2026-05-17 17:00:54
bureau   :   Whoever
Area:  1 X
Zone: 2 Y
Address:
The Site Name
1 Some St, Suburb VIC
Job number   12345`;
    const r = guardianParser.parse(messy);
    expect(r.source).toBe("Guardian Security Group");
    expect(r.bureau).toBe("Whoever");
    expect(r.siteName).toBe("The Site Name");
    expect(r.siteAddress).toBe("1 Some St, Suburb VIC");
    expect(r.sourceReference).toBe("12345");
  });

  it("handles 'Job number: 12345' with colon", () => {
    const variant = CANONICAL_SAMPLE.replace("Job number 180001", "Job number: 180001");
    expect(guardianParser.parse(variant).sourceReference).toBe("180001");
  });

  it("partially parses when bureau is missing", () => {
    const noBureau = CANONICAL_SAMPLE.replace(/^Bureau:.*$/m, "");
    const r = guardianParser.parse(noBureau);
    expect(r.bureau).toBeUndefined();
    expect(r.areaLabel).toBe("1 MJB Cont - Access");
    expect(r.zoneLabel).toBe("2 Front Entry Pir in Factory");
    expect(r.siteName).toBe("MJB Contractors - Access Way");
  });

  it("partially parses when zone is missing (alarmType falls back to OTHER)", () => {
    const noZone = CANONICAL_SAMPLE.replace(/^Zone:.*$/m, "");
    const r = guardianParser.parse(noZone);
    expect(r.zoneLabel).toBeUndefined();
    expect(r.alarmType).toBe("OTHER");
  });

  it("returns undefined receivedAt for invalid date format", () => {
    const badDate = CANONICAL_SAMPLE.replace("2026-05-17 17:00:54", "not a date");
    const r = guardianParser.parse(badDate);
    expect(r.receivedAt).toBeUndefined();
    // Other fields still parse
    expect(r.siteName).toBe("MJB Contractors - Access Way");
  });

  it("handles 2-line address block (just name + combined street/suburb)", () => {
    const twoLine = `From: Guardian Security Group
2026-05-17 17:00:54
Bureau: X
Area: A
Zone: Z PIR
Address:
ACME Site
123 Main St, Somewhere VIC
Job number 1`;
    const r = guardianParser.parse(twoLine);
    expect(r.siteName).toBe("ACME Site");
    expect(r.siteAddress).toBe("123 Main St, Somewhere VIC");
  });

  it("handles 4-line address block (unit + street + suburb + postcode)", () => {
    const fourLine = `From: Guardian Security Group
2026-05-17 17:00:54
Bureau: X
Area: A
Zone: Z PIR
Address:
ACME Corp
Unit 5A
123 Main St
Somewhere VIC 3000
Job number 1`;
    const r = guardianParser.parse(fourLine);
    expect(r.siteName).toBe("ACME Corp");
    expect(r.siteAddress).toBe("Unit 5A, 123 Main St, Somewhere VIC 3000");
  });

  it("address block stops at the next label (Job number)", () => {
    const r = guardianParser.parse(CANONICAL_SAMPLE);
    // Should NOT include "Job number 180001" in siteAddress
    expect(r.siteAddress).not.toMatch(/Job number/i);
  });
});

describe("detectAndParse — registry", () => {
  it("uses guardian with confidence=high on canonical sample", () => {
    const r = detectAndParse(CANONICAL_SAMPLE);
    expect(r.parser).toBe("guardian");
    expect(r.confidence).toBe("high");
    expect(r.fields.siteName).toBe("MJB Contractors - Access Way");
  });

  it("falls back to manual on a completely non-Guardian message", () => {
    const r = detectAndParse("Hey can you call me about the job?");
    expect(r.parser).toBe("manual");
    expect(r.confidence).toBe("manual");
    expect(r.fields).toEqual({});
  });

  it("preserves the raw text for audit storage", () => {
    const r = detectAndParse(CANONICAL_SAMPLE);
    expect(r.rawText).toBe(CANONICAL_SAMPLE);
  });

  it("uses guardian with confidence=low on a partial match", () => {
    const partial = `Bureau: X
Area: A
Zone: Z PIR
Job number 1`;
    const r = detectAndParse(partial);
    expect(r.parser).toBe("guardian");
    expect(r.confidence).toBe("low");
  });
});

describe("inferAlarmType", () => {
  it("PIR → BURGLARY", () => {
    expect(inferAlarmType("2 Front Entry Pir in Factory")).toBe("BURGLARY");
  });

  it("motion → BURGLARY", () => {
    expect(inferAlarmType("Motion sensor lobby")).toBe("BURGLARY");
  });

  it("movement → BURGLARY", () => {
    expect(inferAlarmType("Movement detected stairwell")).toBe("BURGLARY");
  });

  it("door → BURGLARY", () => {
    expect(inferAlarmType("Rear door contact")).toBe("BURGLARY");
  });

  it("glass break → BURGLARY", () => {
    expect(inferAlarmType("Glass break front window")).toBe("BURGLARY");
  });

  it("smoke → FIRE", () => {
    expect(inferAlarmType("Smoke detector level 2")).toBe("FIRE");
  });

  it("fire → FIRE", () => {
    expect(inferAlarmType("Fire alarm general")).toBe("FIRE");
  });

  it("heat detector → FIRE", () => {
    expect(inferAlarmType("Heat detector kitchen")).toBe("FIRE");
  });

  it("duress → DURESS (overlaps panic; duress wins)", () => {
    expect(inferAlarmType("Duress button reception")).toBe("DURESS");
  });

  it("panic → PANIC", () => {
    expect(inferAlarmType("Panic button bank counter")).toBe("PANIC");
  });

  it("holdup → PANIC", () => {
    expect(inferAlarmType("Hold-up trigger till 3")).toBe("PANIC");
  });

  it("medical → MEDICAL", () => {
    expect(inferAlarmType("Medical alert wristband")).toBe("MEDICAL");
  });

  it("tamper → TAMPER", () => {
    expect(inferAlarmType("Tamper detected zone 14")).toBe("TAMPER");
  });

  it("unmatched → OTHER", () => {
    expect(inferAlarmType("System status update")).toBe("OTHER");
  });

  it("empty input → OTHER", () => {
    expect(inferAlarmType("")).toBe("OTHER");
    expect(inferAlarmType(null)).toBe("OTHER");
    expect(inferAlarmType(undefined)).toBe("OTHER");
  });

  it("'pir' as substring of 'spirit' does NOT match", () => {
    expect(inferAlarmType("Christmas spirit display")).toBe("OTHER");
  });
});

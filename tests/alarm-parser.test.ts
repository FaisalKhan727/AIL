import { describe, expect, it } from "vitest";
import { parseAlarmReply, combineHHmmWithDispatch } from "@/lib/alarms/parser";

describe("parseAlarmReply", () => {
  describe("complete (ONSITE/OFFSITE pattern)", () => {
    it("parses the canonical spec example", () => {
      const r = parseAlarmReply("ONSITE 1147 OFFSITE 1213 ALL GOOD AND SECURE");
      expect(r).toEqual({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
        resultText: "ALL GOOD AND SECURE",
      });
    });

    it("accepts 'ON SITE' / 'OFF SITE' (spaced keywords)", () => {
      const r = parseAlarmReply("ON SITE 11:47 OFF SITE 12:13 false alarm");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
        resultText: "false alarm",
      });
    });

    it("accepts ARRIVED / DEPARTED", () => {
      const r = parseAlarmReply("Arrived 1147 Departed 1213 broken window rear");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
        resultText: "broken window rear",
      });
    });

    it("accepts ARRIVED / LEFT", () => {
      const r = parseAlarmReply("arrived 0930 left 1015 all clear");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "09:30",
        offsiteHHmm: "10:15",
      });
    });

    it("accepts dot-separated times", () => {
      const r = parseAlarmReply("ONSITE 11.47 OFFSITE 12.13 ok");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
      });
    });

    it("accepts colon-separated times", () => {
      const r = parseAlarmReply("ONSITE 23:55 OFFSITE 00:30 secure");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "23:55",
        offsiteHHmm: "00:30",
        resultText: "secure",
      });
    });

    it("accepts 12-hour AM/PM format", () => {
      const r = parseAlarmReply("ONSITE 11:47 PM OFFSITE 12:13 AM all good");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "23:47",
        offsiteHHmm: "00:13",
      });
    });

    it("accepts 12-hour PM without space", () => {
      const r = parseAlarmReply("ONSITE 1:47PM OFFSITE 2:13PM clear");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "13:47",
        offsiteHHmm: "14:13",
      });
    });

    it("accepts the loose '1147 to 1213' range pattern", () => {
      const r = parseAlarmReply("1147 to 1213, all clear");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
      });
    });

    it("trims the result text and strips leftover punctuation", () => {
      const r = parseAlarmReply("ONSITE 1147 OFFSITE 1213. All good, premises secure.");
      expect(r).toMatchObject({
        kind: "complete",
        resultText: "All good, premises secure.",
      });
    });

    it("empty result is fine", () => {
      const r = parseAlarmReply("ONSITE 1147 OFFSITE 1213");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "11:47",
        offsiteHHmm: "12:13",
        resultText: "",
      });
    });
  });

  describe("acknowledged (no times, just affirmative)", () => {
    it("bare OK", () => {
      expect(parseAlarmReply("OK")).toEqual({ kind: "acknowledged" });
    });

    it("OK with trailing text is still ack", () => {
      expect(parseAlarmReply("OK got it")).toEqual({ kind: "acknowledged" });
    });

    it("ON MY WAY", () => {
      expect(parseAlarmReply("on my way")).toEqual({ kind: "acknowledged" });
    });

    it("OMW", () => {
      expect(parseAlarmReply("omw")).toEqual({ kind: "acknowledged" });
    });

    it("YES", () => {
      expect(parseAlarmReply("YES")).toEqual({ kind: "acknowledged" });
    });
  });

  describe("declined", () => {
    it("NO", () => {
      expect(parseAlarmReply("NO")).toEqual({ kind: "declined" });
    });

    it("Can't", () => {
      expect(parseAlarmReply("Can't, busy")).toEqual({ kind: "declined" });
    });

    it("Unavailable", () => {
      expect(parseAlarmReply("Unavailable")).toEqual({ kind: "declined" });
    });
  });

  describe("unparsed", () => {
    it("free-form text without keywords or times", () => {
      const r = parseAlarmReply("Stuck in traffic mate");
      expect(r.kind).toBe("unparsed");
    });

    it("empty body", () => {
      const r = parseAlarmReply("");
      expect(r.kind).toBe("unparsed");
    });

    it("whitespace only", () => {
      const r = parseAlarmReply("   \n\t  ");
      expect(r.kind).toBe("unparsed");
    });

    it("ONSITE without OFFSITE rejects", () => {
      const r = parseAlarmReply("ONSITE 1147, will update");
      expect(r.kind).toBe("unparsed");
    });
  });

  describe("time-of-day edge cases", () => {
    it("rejects 99:99", () => {
      const r = parseAlarmReply("ONSITE 99:99 OFFSITE 1213 nope");
      expect(r.kind).toBe("unparsed");
    });

    it("rejects 25:00", () => {
      const r = parseAlarmReply("ONSITE 25:00 OFFSITE 26:00");
      expect(r.kind).toBe("unparsed");
    });

    it("accepts midnight 0000", () => {
      const r = parseAlarmReply("ONSITE 0000 OFFSITE 0030");
      expect(r).toMatchObject({
        kind: "complete",
        onsiteHHmm: "00:00",
        offsiteHHmm: "00:30",
      });
    });
  });
});

describe("combineHHmmWithDispatch", () => {
  it("treats time later-in-the-day as same day", () => {
    const dispatched = new Date(2026, 4, 17, 11, 36, 0); // 11:36
    const combined = combineHHmmWithDispatch("11:47", dispatched);
    expect(combined.getDate()).toBe(17);
    expect(combined.getHours()).toBe(11);
    expect(combined.getMinutes()).toBe(47);
  });

  it("rolls onsite to next day when reported earlier than dispatch", () => {
    const dispatched = new Date(2026, 4, 17, 23, 55, 0); // 23:55 on the 17th
    const combined = combineHHmmWithDispatch("00:10", dispatched);
    expect(combined.getDate()).toBe(18);
    expect(combined.getHours()).toBe(0);
    expect(combined.getMinutes()).toBe(10);
  });
});

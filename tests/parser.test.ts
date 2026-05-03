import { describe, expect, it } from "vitest";
import { parseInboundReply, type ParserShift } from "../lib/sms/parser";

const threeShifts: ParserShift[] = [
  { shiftId: "s1", index: 1, confirmCode: "K7Q9" },
  { shiftId: "s2", index: 2, confirmCode: "K2X4" },
  { shiftId: "s3", index: 3, confirmCode: "P9R2" },
];

const oneShift: ParserShift[] = [{ shiftId: "s1", index: 1, confirmCode: "AB12" }];

function expectOk(result: ReturnType<typeof parseInboundReply>) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.decisions;
}

describe("parseInboundReply", () => {
  it("ALL YES — uppercase", () => {
    const d = expectOk(parseInboundReply("ALL YES", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "YES" },
      { shiftId: "s3", decision: "YES" },
    ]);
  });

  it("YES ALL — mixed case", () => {
    const d = expectOk(parseInboundReply("Yes all", threeShifts));
    expect(d.every((x) => x.decision === "YES")).toBe(true);
    expect(d).toHaveLength(3);
  });

  it("Y ALL — short form", () => {
    const d = expectOk(parseInboundReply("y all", threeShifts));
    expect(d.every((x) => x.decision === "YES")).toBe(true);
  });

  it("ALL NO", () => {
    const d = expectOk(parseInboundReply("all no", threeShifts));
    expect(d.every((x) => x.decision === "NO")).toBe(true);
    expect(d).toHaveLength(3);
  });

  it("N ALL", () => {
    const d = expectOk(parseInboundReply("N ALL", threeShifts));
    expect(d.every((x) => x.decision === "NO")).toBe(true);
  });

  it("comma separated numbered pairs", () => {
    const d = expectOk(parseInboundReply("1 YES, 2 NO, 3 YES", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "NO" },
      { shiftId: "s3", decision: "YES" },
    ]);
  });

  it("compact 1Y 2N 3Y", () => {
    const d = expectOk(parseInboundReply("1Y 2N 3Y", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "NO" },
      { shiftId: "s3", decision: "YES" },
    ]);
  });

  it("equals delimiter 1=yes, 2=no", () => {
    const d = expectOk(parseInboundReply("1=yes, 2=no", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "NO" },
    ]);
  });

  it("messy whitespace", () => {
    const d = expectOk(parseInboundReply("  1   YES  ,   2   NO  ,3 YES  ", threeShifts));
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({ shiftId: "s1", decision: "YES" });
    expect(d[2]).toEqual({ shiftId: "s3", decision: "YES" });
  });

  it("colon delimiter 1: yes, 2: no", () => {
    const d = expectOk(parseInboundReply("1: yes, 2: no", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "NO" },
    ]);
  });

  it("dash delimiter 1-Y 2-N", () => {
    const d = expectOk(parseInboundReply("1-Y 2-N", threeShifts));
    expect(d).toEqual([
      { shiftId: "s1", decision: "YES" },
      { shiftId: "s2", decision: "NO" },
    ]);
  });

  it("YES K7Q9 — match by confirm code", () => {
    const d = expectOk(parseInboundReply("YES K7Q9", threeShifts));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("NO K7Q9 K2X4 — multiple codes", () => {
    const d = expectOk(parseInboundReply("NO K7Q9 NO K2X4", threeShifts));
    expect(d).toContainEqual({ shiftId: "s1", decision: "NO" });
    expect(d).toContainEqual({ shiftId: "s2", decision: "NO" });
  });

  it("code first then decision: K7Q9 YES", () => {
    const d = expectOk(parseInboundReply("K7Q9 yes", threeShifts));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("bare YES — single pending shift", () => {
    const d = expectOk(parseInboundReply("YES", oneShift));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("bare NO — single pending shift", () => {
    const d = expectOk(parseInboundReply("no", oneShift));
    expect(d).toEqual([{ shiftId: "s1", decision: "NO" }]);
  });

  it("bare YES with 3 pending — unparsed (ambiguous)", () => {
    const r = parseInboundReply("YES", threeShifts);
    expect(r.status).toBe("unparsed");
  });

  it("garbage text — unparsed", () => {
    const r = parseInboundReply("hi mate when's the next shift", threeShifts);
    expect(r.status).toBe("unparsed");
  });

  it("empty body — unparsed", () => {
    const r = parseInboundReply("", threeShifts);
    expect(r.status).toBe("unparsed");
  });

  it("partial — only some shifts answered", () => {
    const d = expectOk(parseInboundReply("1 YES", threeShifts));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("dedup — last decision per index wins", () => {
    const d = expectOk(parseInboundReply("1 YES, 1 NO", threeShifts));
    expect(d).toEqual([{ shiftId: "s1", decision: "NO" }]);
  });

  it("invalid index ignored", () => {
    const d = expectOk(parseInboundReply("1 YES, 9 NO", threeShifts));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("synonym — YEP counts as YES", () => {
    const d = expectOk(parseInboundReply("yep", oneShift));
    expect(d).toEqual([{ shiftId: "s1", decision: "YES" }]);
  });

  it("synonym — NOPE counts as NO", () => {
    const d = expectOk(parseInboundReply("nope", oneShift));
    expect(d).toEqual([{ shiftId: "s1", decision: "NO" }]);
  });
});

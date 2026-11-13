import { describe, expect, it } from "vitest";
import {
  alertMessage,
  daysUntilExpiry,
  dueAlertThreshold,
  guardCompliance,
  licenceStatus,
  preChecks,
} from "@/lib/licences";
import { compareWithRegister, normaliseRegisterDate } from "@/lib/licence-register";
import { normalisePhone } from "@/lib/phone";

const NOW = new Date("2026-06-15T03:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 5, 15 + n));
const lic = (over: Partial<{ type: string; expiryDate: Date | null; verification: string }> = {}) => ({
  type: "SECURITY_1A",
  expiryDate: day(200),
  verification: "VERIFIED",
  ...over,
});

describe("daysUntilExpiry", () => {
  it("counts whole calendar days and treats the expiry date as still valid", () => {
    expect(daysUntilExpiry(day(0), NOW)).toBe(0);
    expect(daysUntilExpiry(day(1), NOW)).toBe(1);
    expect(daysUntilExpiry(day(-1), NOW)).toBe(-1);
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
  it("accepts ISO strings", () => {
    expect(daysUntilExpiry("2026-06-25", NOW)).toBe(10);
  });
});

describe("licenceStatus", () => {
  it("is VALID when verified and well in date", () => {
    expect(licenceStatus(lic(), NOW)).toBe("VALID");
  });
  it("steps through EXPIRING and URGENT at 60 and 14 days", () => {
    expect(licenceStatus(lic({ expiryDate: day(61) }), NOW)).toBe("VALID");
    expect(licenceStatus(lic({ expiryDate: day(60) }), NOW)).toBe("EXPIRING");
    expect(licenceStatus(lic({ expiryDate: day(15) }), NOW)).toBe("EXPIRING");
    expect(licenceStatus(lic({ expiryDate: day(14) }), NOW)).toBe("URGENT");
    expect(licenceStatus(lic({ expiryDate: day(0) }), NOW)).toBe("URGENT");
  });
  it("is EXPIRED the day after expiry, verified or not", () => {
    expect(licenceStatus(lic({ expiryDate: day(-1) }), NOW)).toBe("EXPIRED");
    expect(licenceStatus(lic({ expiryDate: day(-1), verification: "UNVERIFIED" }), NOW)).toBe("EXPIRED");
  });
  it("never reports an unverified licence as valid", () => {
    expect(licenceStatus(lic({ verification: "UNVERIFIED" }), NOW)).toBe("UNVERIFIED");
  });
  it("keeps REJECTED regardless of dates", () => {
    expect(licenceStatus(lic({ verification: "REJECTED" }), NOW)).toBe("REJECTED");
  });
  it("allows non-expiring credentials to be valid with no date", () => {
    expect(licenceStatus(lic({ type: "WHITE_CARD", expiryDate: null }), NOW)).toBe("VALID");
  });
});

describe("guardCompliance", () => {
  it("blocks a guard with no security licence", () => {
    const r = guardCompliance([lic({ type: "FIRST_AID" })], NOW);
    expect(r.level).toBe("block");
    expect(r.issues[0].message).toMatch(/No security licence/);
  });
  it("blocks when the only security licence is unverified", () => {
    const r = guardCompliance([lic({ verification: "UNVERIFIED" })], NOW);
    expect(r.level).toBe("block");
    expect(r.issues[0].message).toMatch(/not been verified/);
  });
  it("blocks a shift that falls after the licence expires", () => {
    const r = guardCompliance([lic({ expiryDate: day(5) })], day(10));
    expect(r.level).toBe("block");
    expect(r.issues[0].message).toMatch(/expired on the shift date/);
  });
  it("clears a guard whose renewal is verified even if the old licence lapsed", () => {
    const r = guardCompliance([lic({ expiryDate: day(-30) }), lic({ expiryDate: day(700) })], NOW);
    expect(r.level).toBe("ok");
  });
  it("only warns about lapsed supporting certificates", () => {
    const r = guardCompliance([lic(), lic({ type: "FIRST_AID", expiryDate: day(-3) })], NOW);
    expect(r.level).toBe("warn");
    expect(r.issues[0]).toEqual({ severity: "warn", message: "First Aid is expired on the shift date" });
  });
});

describe("dueAlertThreshold", () => {
  it("sends nothing while more than 60 days remain", () => {
    expect(dueAlertThreshold(61, null)).toBeNull();
  });
  it("sends each threshold once", () => {
    expect(dueAlertThreshold(60, null)).toBe(60);
    expect(dueAlertThreshold(45, 60)).toBeNull();
    expect(dueAlertThreshold(30, 60)).toBe(30);
    expect(dueAlertThreshold(0, 7)).toBe(0);
    expect(dueAlertThreshold(-7, 0)).toBe(-7);
    expect(dueAlertThreshold(-20, -7)).toBeNull();
  });
  it("jumps straight to the tightest threshold for a late-added licence", () => {
    expect(dueAlertThreshold(10, null)).toBe(14);
  });
  it("ignores licences with no expiry", () => {
    expect(dueAlertThreshold(null, null)).toBeNull();
  });
});

describe("alertMessage", () => {
  it("links to the guard app when a base URL is known", () => {
    const m = alertMessage("Liam", "SECURITY_1A", new Date("2026-07-01T00:00:00Z"), 14, "https://x.example");
    expect(m).toContain("security licence (Unarmed Guard) expires on 01/07/2026");
    expect(m).toContain("https://x.example/m/licences");
  });
  it("says expired, not 'expires today', once the date has passed", () => {
    const m = alertMessage("Liam", "SECURITY_1A", new Date("2026-06-01T00:00:00Z"), -3, "");
    expect(m).toMatch(/expired on 01\/06\/2026/);
    expect(m).toMatch(/can't be rostered/);
  });
  it("doesn't threaten rostering over a supporting certificate", () => {
    const m = alertMessage("Liam", "CPR", new Date("2026-06-01T00:00:00Z"), -7, "");
    expect(m).toMatch(/CPR expired on/);
    expect(m).not.toMatch(/rostered/);
  });
  it("says today on the day", () => {
    expect(alertMessage("Liam", "RSA", new Date("2026-06-15T00:00:00Z"), 0, "")).toMatch(/expires today/);
  });
});

describe("preChecks", () => {
  it("flags an implausible number, a past expiry and a duplicate holder", () => {
    const r = preChecks({ type: "SECURITY_1A", number: "abc", state: "NSW", expiryDate: day(-2) }, "Sam Lee", NOW);
    expect(r.map((c) => c.pass)).toEqual([false, false, false]);
  });
  it("passes a well-formed NSW number in date", () => {
    const r = preChecks({ type: "SECURITY_1A", number: "409123456", state: "NSW", expiryDate: day(90) }, null, NOW);
    expect(r.every((c) => c.pass)).toBe(true);
  });
  it("skips the format check for states without a known pattern", () => {
    const r = preChecks({ type: "SECURITY_1A", number: "X1", state: "WA", expiryDate: day(90) }, null, NOW);
    expect(r.find((c) => c.label === "Number format")).toBeUndefined();
  });
});

describe("register comparison", () => {
  const input = { type: "SECURITY_1A", number: "409123456", state: "NSW", expiryDate: new Date("2027-03-01T00:00:00Z"), guardFirstName: "Liam", guardLastName: "Nguyen" };
  it("confirms a current licence whose holder and expiry match", () => {
    expect(compareWithRegister(input, { status: "Current", expiry: "2027-03-01", name: "NGUYEN, Liam" }).outcome).toBe("CONFIRMED");
  });
  it("does not confirm when the register has no status", () => {
    expect(compareWithRegister(input, { name: "NGUYEN, Liam" }).outcome).toBe("MISMATCH");
  });
  it("rejects cancelled, wrong-holder and wrong-expiry records", () => {
    expect(compareWithRegister(input, { status: "Cancelled", name: "Liam Nguyen" }).outcome).toBe("MISMATCH");
    expect(compareWithRegister(input, { status: "Current", name: "Jordan Smith" }).outcome).toBe("MISMATCH");
    expect(compareWithRegister(input, { status: "Current", expiry: "2026-03-01", name: "Liam Nguyen" }).outcome).toBe("MISMATCH");
  });
  it("normalises AU and ISO dates", () => {
    expect(normaliseRegisterDate("1/03/2027")).toBe("2027-03-01");
    expect(normaliseRegisterDate("2027-03-01T00:00:00")).toBe("2027-03-01");
    expect(normaliseRegisterDate("soon")).toBeUndefined();
  });
});

describe("normalisePhone", () => {
  it("accepts the ways people type Australian mobiles", () => {
    expect(normalisePhone("0412 345 678")).toBe("+61412345678");
    expect(normalisePhone("+61 412 345 678")).toBe("+61412345678");
    expect(normalisePhone("61412345678")).toBe("+61412345678");
  });
  it("rejects junk", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("hello")).toBeNull();
  });
});

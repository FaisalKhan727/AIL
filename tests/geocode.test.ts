import { describe, expect, it } from "vitest";
import { normaliseAddress } from "@/lib/geocode";

describe("normaliseAddress", () => {
  it("lowercases", () => {
    expect(normaliseAddress("123 MAIN ST")).toBe("123 main st");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normaliseAddress("   123 main st   ")).toBe("123 main st");
  });

  it("collapses internal whitespace", () => {
    expect(normaliseAddress("123    main    st")).toBe("123 main st");
  });

  it("normalises comma spacing", () => {
    expect(normaliseAddress("123 main st,carrum downs,vic")).toBe(
      "123 main st, carrum downs, vic",
    );
  });

  it("treats multiple variants of the canonical sample address as the same key", () => {
    const a = "41B Access Way, Carrum Downs, Victoria, 3201";
    const b = "41b access way , carrum downs ,  victoria , 3201";
    const c = "  41B    Access Way,Carrum Downs,Victoria,3201  ";
    expect(normaliseAddress(a)).toBe(normaliseAddress(b));
    expect(normaliseAddress(b)).toBe(normaliseAddress(c));
  });

  it("preserves the order of address components", () => {
    expect(normaliseAddress("Vic, Carrum Downs, 41B Access Way")).not.toBe(
      normaliseAddress("41B Access Way, Carrum Downs, Vic"),
    );
  });
});
